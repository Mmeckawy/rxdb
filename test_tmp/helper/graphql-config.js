export var GRAPHQL_PATH = '/graphql';
export var GRAPHQL_SUBSCRIPTION_PATH = '/subscriptions';
export async function getDocsOnServer(replicationState) {
  var response = await replicationState.graphQLRequest({
    query: "{\n            getAll {\n                id\n                name\n                age\n                updatedAt\n                deleted\n            }\n        }",
    variables: {}
  });
  return response.data.getAll;
}
//# sourceMappingURL=graphql-config.js.map