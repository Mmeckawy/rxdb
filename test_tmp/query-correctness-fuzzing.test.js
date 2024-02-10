import { randomCouchString, fillWithDefaultSettings, now, createRevision, prepareQuery, ensureNotFalsy, normalizeMangoQuery } from '../plugins/core/index.mjs';
import * as assert from 'assert';
import config from "./unit/config.js";
import { randomOfArray } from 'event-reduce-js';
import { randomQuery, getRandomChangeEvents, mingoCollectionCreator, applyChangeEvent } from 'event-reduce-js/truth-table-generator';

/**
 * Creates random writes, indexes and queries and tests if the results are correct.
 */
describe('query-correctness-fuzzing.test.ts', () => {
  it('init storage', async () => {
    if (config.storage.init) {
      await config.storage.init();
    }
  });
  it('run tests', async function () {
    this.timeout(1000 * 1000000);
    var runsPerInstance = 5;
    var eventsAmount = 30;
    var queriesAmount = 30;
    var totalRuns = 0;
    while (true) {
      totalRuns++;
      console.log('-----------NEW RUN #' + totalRuns);
      var indexes = [['_id'], ['name', 'gender', 'age'], ['gender', 'age', 'name'], ['age', 'name', 'gender'], ['gender', 'age'], ['name', 'gender']];
      var sorts = [[{
        '_id': 'asc'
      }], [{
        'gender': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'name': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'age': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'gender': 'asc'
      }, {
        'name': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'name': 'asc'
      }, {
        'gender': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'gender': 'asc'
      }, {
        'age': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'age': 'asc'
      }, {
        'name': 'asc'
      }, {
        '_id': 'asc'
      }], [{
        'age': 'asc'
      }, {
        'gender': 'asc'
      }, {
        'name': 'asc'
      }, {
        '_id': 'asc'
      }]];
      var schemaPlain = {
        primaryKey: '_id',
        type: 'object',
        version: 0,
        properties: {
          _id: {
            type: 'string',
            maxLength: 20
          },
          name: {
            type: 'string',
            maxLength: 20
          },
          gender: {
            type: 'string',
            enum: ['f', 'm', 'x'],
            maxLength: 1
          },
          age: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            multipleOf: 1
          }
        },
        indexes
      };
      var schema = fillWithDefaultSettings(schemaPlain);
      var storageInstance = await config.storage.getStorage().createStorageInstance({
        collectionName: randomCouchString(10),
        databaseName: randomCouchString(10),
        databaseInstanceToken: randomCouchString(10),
        multiInstance: false,
        devMode: false,
        options: {},
        schema
      });
      var collection = mingoCollectionCreator();
      var runs = 0;
      var _loop = async function () {
        runs++;
        var procedure = getRandomChangeEvents(eventsAmount);
        for (var changeEvent of procedure) {
          applyChangeEvent(collection, changeEvent);
          var docs = await storageInstance.findDocumentsById([changeEvent.id], true);
          var previous = docs[0];
          var nextRev = createRevision(randomCouchString(10), previous);
          if (changeEvent.operation === 'DELETE') {
            var writeResult = await storageInstance.bulkWrite([{
              previous: previous,
              document: Object.assign({}, changeEvent.previous, {
                _deleted: true,
                _rev: nextRev,
                _meta: {
                  lwt: now()
                },
                _attachments: {}
              })
            }], 'randomevent-delete');
            assert.deepStrictEqual(writeResult.error, []);
          } else {
            var _writeResult = await storageInstance.bulkWrite([{
              previous: previous,
              document: Object.assign({}, changeEvent.doc, {
                _deleted: false,
                _rev: nextRev,
                _meta: {
                  lwt: now()
                },
                _attachments: {}
              })
            }], 'randomevent');
            assert.deepStrictEqual(_writeResult.error, []);
          }
        }

        // ensure all docs are equal
        var allStorage = await storageInstance.query(prepareQuery(schema, {
          selector: {
            _deleted: {
              $eq: false
            }
          },
          skip: 0,
          sort: [{
            _id: 'asc'
          }]
        }));
        var allCorrect = collection.query({
          selector: {},
          sort: ['_id']
        });
        allCorrect.forEach((d, idx) => {
          var correctDoc = allStorage.documents[idx];
          if (d._id !== correctDoc._id) {
            console.dir(allStorage);
            console.dir(allCorrect);
            throw new Error('State not equal after writes');
          }
        });
        var queryC = 0;
        var _loop2 = async function () {
          queryC++;
          var query = randomQuery();
          var sort = randomOfArray(sorts);
          var mingoSort = sort.map(sortPart => {
            var dirPrefix = Object.values(sortPart)[0] === 'asc' ? '' : '-';
            return dirPrefix + Object.keys(sortPart)[0];
          });
          query.sort = mingoSort;
          var correctResult = collection.query(query);
          query.sort = sort;
          query.selector._deleted = {
            $eq: false
          };
          // must have the same result for all indexes
          var _loop3 = async function () {
            var useQuery = normalizeMangoQuery(schema, query);
            useQuery.index = index;
            var preparedQuery = prepareQuery(schema, useQuery);
            var storageResult = await storageInstance.query(preparedQuery);
            storageResult.documents.forEach((d, idx) => {
              var correctDoc = correctResult[idx];
              if (d._id !== correctDoc._id) {
                console.dir(preparedQuery);
                console.dir(correctResult);
                console.dir(storageResult);
                throw new Error('WRONG QUERY RESULT!');
              }
            });
          };
          for (var index of ensureNotFalsy(schema.indexes)) {
            await _loop3();
          }
        };
        while (queryC < queriesAmount) {
          await _loop2();
        }

        // run cleanup after each run
        await storageInstance.cleanup(0);
      };
      while (runs < runsPerInstance) {
        await _loop();
      }
      await storageInstance.remove();
    }
  });
});
//# sourceMappingURL=query-correctness-fuzzing.test.js.map