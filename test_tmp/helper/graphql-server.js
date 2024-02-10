/**
 * spawns a graphql-server
 * that can be used in tests and examples
 * @link https://graphql.org/graphql-js/running-an-express-graphql-server/
 */

import { PubSub } from 'graphql-subscriptions';
import { buildSchema, execute, subscribe } from 'graphql';
import { createServer } from 'node:http';
import ws from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
// we need cors because this server is also used in browser-tests
import cors from 'cors';
import { graphqlHTTP } from 'express-graphql';
import { GRAPHQL_PATH, GRAPHQL_SUBSCRIPTION_PATH } from "./graphql-config.js";
import { ensureNotFalsy, lastOfArray } from 'event-reduce-js';
import { nextPort } from '../../plugins/test-utils/index.mjs';
import { graphQLRequest } from '../../plugins/replication-graphql/index.mjs';
function sortByUpdatedAtAndPrimary(a, b) {
  if (a.updatedAt > b.updatedAt) return 1;
  if (a.updatedAt < b.updatedAt) return -1;
  if (a.updatedAt === b.updatedAt) {
    if (a.id > b.id) return 1;
    if (a.id < b.id) return -1;else return 0;
  }
  return 0;
}
export async function spawn(documents = [], portNumber) {
  var port = portNumber ? portNumber : await nextPort();
  var app = express();
  app.use(cors());

  /**
   * schema in graphql
   * matches ./schemas.js#humanWithTimestamp
   */
  var schema = buildSchema("\n        type Checkpoint {\n            id: String!\n            updatedAt: Float!\n        }\n        input CheckpointInput {\n            id: String!\n            updatedAt: Float!\n        }\n        type FeedResponse {\n            documents: [Human!]!\n            checkpoint: Checkpoint!\n        }\n        type Query {\n            info: Int\n            feedForRxDBReplication(checkpoint: CheckpointInput, limit: Int!): FeedResponse!\n            collectionFeedForRxDBReplication(checkpoint: CheckpointInput, limit: Int!): CollectionFeedResponse!\n            getAll: [Human!]!\n        }\n        type Mutation {\n            writeHumans(writeRows: [HumanWriteRow!]): [Human!]\n            writeHumansFail(writeRows: [HumanWriteRow!]): [Human!]\n        }\n        input HumanWriteRow {\n            assumedMasterState: HumanInput,\n            newDocumentState: HumanInput!\n        }\n        input HumanInput {\n            id: ID!,\n            name: String!,\n            age: Int!,\n            updatedAt: Float!,\n            deleted: Boolean!\n        }\n        type Human {\n            id: ID!,\n            name: String!,\n            age: Int!,\n            updatedAt: Float!,\n            deleted: Boolean!,\n            deletedAt: Float\n        }\n        input Headers {\n            token: String\n        }\n        type CollectionFeedResponse {\n            collection: FeedResponse!\n            count: Int!\n        }\n        type Subscription {\n            humanChanged(headers: Headers): FeedResponse\n        }\n        schema {\n            query: Query\n            mutation: Mutation\n            subscription: Subscription\n        }\n    ");
  var pubsub = new PubSub();
  /* pubsub.subscribe('humanChanged', data => {
      console.log('pubsub received!!');
      console.dir(data);
  });*/

  // The root provides a resolver function for each API endpoint
  var root = {
    info: () => 1,
    collectionFeedForRxDBReplication: args => {
      var result = root.feedForRxDBReplication(args);

      // console.log('collection');
      // console.dir(result);

      return {
        collection: result,
        count: result.documents.length
      };
    },
    feedForRxDBReplication: args => {
      var lastId = args.checkpoint ? args.checkpoint.id : '';
      var minUpdatedAt = args.checkpoint ? args.checkpoint.updatedAt : 0;

      // console.log('## feedForRxDBReplication');
      // console.dir(args);
      // sorted by updatedAt and primary
      var sortedDocuments = documents.sort(sortByUpdatedAtAndPrimary);

      // only return where updatedAt >= minUpdatedAt
      var filteredByMinUpdatedAtAndId = sortedDocuments.filter(doc => {
        if (doc.updatedAt < minUpdatedAt) {
          return false;
        } else if (doc.updatedAt > minUpdatedAt) {
          return true;
        } else if (doc.updatedAt === minUpdatedAt) {
          if (doc.id > lastId) {
            return true;
          } else return false;
        }
      });

      // limit if requested
      var limited = args.limit ? filteredByMinUpdatedAtAndId.slice(0, args.limit) : filteredByMinUpdatedAtAndId;
      var last = lastOfArray(limited);
      var ret = {
        documents: limited,
        checkpoint: last ? {
          id: last.id,
          updatedAt: last.updatedAt
        } : {
          id: lastId,
          updatedAt: minUpdatedAt
        }
      };
      return ret;
    },
    getAll: () => {
      return documents;
    },
    writeHumans: args => {
      var rows = args.writeRows;
      var last = null;
      var conflicts = [];
      var storedDocs = rows.map(row => {
        var doc = row.newDocumentState;
        var previousDoc = documents.find(d => d.id === doc.id);
        if (previousDoc && !row.assumedMasterState || previousDoc && row.assumedMasterState && previousDoc.updatedAt > row.assumedMasterState.updatedAt && row.newDocumentState.deleted === previousDoc.deleted) {
          conflicts.push(previousDoc);
          return;
        }
        documents = documents.filter(d => d.id !== doc.id);
        documents.push(doc);
        last = doc;
        return doc;
      });
      if (last) {
        pubsub.publish('humanChanged', {
          humanChanged: {
            documents: storedDocs.filter(d => !!d),
            checkpoint: {
              id: ensureNotFalsy(last).id,
              updatedAt: ensureNotFalsy(last).updatedAt
            }
          }
        });
      }
      return conflicts;
    },
    // used in tests
    writeHumansFail: _args => {
      throw new Error('writeHumansFail called');
    },
    humanChanged: () => pubsub.asyncIterator('humanChanged')
  };

  // header simulation middleware
  var reqHeaderName = '';
  var reqHeaderValue = '';
  app.use((req, res, next) => {
    if (!reqHeaderName) {
      next();
      return;
    }
    if (req.header(reqHeaderName.toLowerCase()) !== reqHeaderValue) {
      res.status(200).json({
        'errors': [{
          'extensions': {
            'code': 'UNAUTHENTICATED'
          },
          'message': 'user not authenticated'
        }]
      });
    } else {
      next();
    }
  });
  app.use(GRAPHQL_PATH, graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true
  }));
  var httpUrl = 'http://localhost:' + port + GRAPHQL_PATH;
  var clientState = {
    headers: {},
    credentials: undefined
  };
  var retServer = new Promise(res => {
    var server = app.listen(port, function () {
      var wsPort = port + 500;
      var wss = createServer(server);
      var wsServer = new ws.Server({
        server: wss,
        path: GRAPHQL_SUBSCRIPTION_PATH
      });
      var websocketUrl = 'ws://localhost:' + wsPort + GRAPHQL_SUBSCRIPTION_PATH;
      wss.listen(wsPort, () => {
        // console.log(`GraphQL Server is now running on http://localhost:${wsPort}`);
        // Set up the WebSocket for handling GraphQL subscriptions
        var subServer = useServer({
          onConnect: ctx => {
            if (reqHeaderName) {
              // Only check auth when required header was set
              var headers = ctx.connectionParams?.headers;
              if (headers[reqHeaderName] !== reqHeaderValue) {
                return false;
              }
            }
          },
          schema,
          execute,
          subscribe,
          roots: {
            subscription: {
              humanChanged: root.humanChanged
            }
          }
        }, wsServer);
        res({
          port,
          wsPort,
          subServer,
          url: {
            http: httpUrl,
            ws: websocketUrl
          },
          async setDocument(doc) {
            var previous = documents.find(d => d.id === doc.id);
            var row = {
              assumedMasterState: previous ? previous : undefined,
              newDocumentState: doc
            };
            var result = await graphQLRequest(fetch, httpUrl, clientState, {
              query: "\n                                    mutation CreateHumans($writeRows: [HumanWriteRow!]) {\n                                        writeHumans(writeRows: $writeRows) { id }\n                                    }\n                                ",
              operationName: 'CreateHumans',
              variables: {
                writeRows: [row]
              }
            });
            if (result.data.writeHumans.length > 0) {
              throw new Error('setDocument() caused a conflict');
            }
            return result;
          },
          overwriteDocuments(docs) {
            documents = docs.slice();
          },
          getDocuments() {
            return documents.slice(0);
          },
          requireHeader(name, value) {
            reqHeaderName = name;
            reqHeaderValue = value;
            if (!name) {
              reqHeaderName = '';
              reqHeaderValue = '';
              clientState.headers = {};
            } else {
              clientState.headers = {
                [name]: value
              };
            }
          },
          close(now = false) {
            if (now) {
              server.close();
              subServer.dispose();
              return Promise.resolve();
            } else {
              return new Promise(res2 => {
                setTimeout(() => {
                  server.close();
                  subServer.dispose();
                  res2();
                }, 1000);
              });
            }
          }
        });
        return subServer;
      });
    });
  });
  return retServer;
}
//# sourceMappingURL=graphql-server.js.map