/// <reference path="../node_modules/@types/mocha/index.d.ts" />
/// <reference path="../node_modules/@types/assert/index.d.ts" />
/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * this checks if typings work as expected
 */
import * as assert from 'assert';
import { schemas } from '../plugins/test-utils/index.mjs';
import { createRxDatabase, addRxPlugin, createBlob } from '../plugins/core/index.mjs';
import { getRxStorageMemory } from '../plugins/storage-memory/index.mjs';
describe('typings.test.js', function () {
  describe('basic', () => {
    it('should fail on broken code', () => {
      var x = 'foo';
      // @ts-expect-error not a string
      x = 1337;
      assert.ok(x);
    });
  });
  describe('database', () => {
    describe('positive', () => {
      it('should create the database and use its methods', async () => {
        var databaseCreator = {
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        };
        var myDb = await createRxDatabase(databaseCreator);
        await myDb.destroy();
      });
      it('allow to type-define the collections', () => {
        var db = {};
        var col = db.foobar;
      });
      it('a collection-untyped database should allow all collection-getters', () => {
        var db = {};
        var col = db.foobar;
      });
      it('an collection-TYPED database should allow to access methods', () => {
        var db = {};
        var col = db.foobar;
      });
      it('an allow to use a custom extends type', async () => {
        var db = await createRxDatabase({
          name: 'heroes',
          storage: getRxStorageMemory()
        });
        var col = db.hero;
        await db.destroy();
      });
    });
    describe('negative', () => {
      it('should not allow additional parameters', () => {
        var databaseCreator = {
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false,
          // @ts-expect-error foo param does not exist
          foo: 'bar'
        };
        assert.ok(databaseCreator);
      });
      it('an collection-TYPED database should only allow known collection-getters', () => {
        var db = {};
        var col = db.foobar;

        // @ts-expect-error foobar2 does not exist
        assert.ok(!db.foobar2);
      });
    });
  });
  describe('schema', () => {
    describe('positive', () => {
      it('should work with DocType = any', () => {
        var schema = schemas.humanMinimal;
        assert.ok(schema);
      });
      it('should allow creating generic schema based on a model', async () => {
        var databaseCreator = {
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        };
        var myDb = await createRxDatabase(databaseCreator);
        var minimalHuman = schemas.humanMinimal;
        var myCollections = await myDb.addCollections({
          humans: {
            schema: minimalHuman
          }
        });
        await myDb.destroy();
      });
      it('should allow \'as const\' composite primary schemas to work', () => {
        var humanCompositePrimaryTyped = schemas.humanCompositePrimarySchemaLiteral;
      });
    });
    describe('negative', () => {
      it('should not allow wrong properties when passing a model', async () => {
        var databaseCreator = {
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        };
        var myDb = await createRxDatabase(databaseCreator);

        // @ts-expect-error broken schema
        var minimalHuman = schemas.humanMinimalBroken;
        await myDb.destroy();
      });
    });
  });
  describe('collection', () => {
    describe('positive', () => {
      it('collection-creation', async () => {
        var myDb = await createRxDatabase({
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        });
        var mySchema = schemas.human;
        var cols = await myDb.addCollections({
          humans: {
            schema: mySchema,
            autoMigrate: false
          }
        });
        var myCollections = cols.humans;
      });
      it('typed collection should know its static orm methods', async () => {
        var myDb = await createRxDatabase({
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        });
        var mySchema = schemas.human;
        var myCollections = await myDb.addCollections({
          humans: {
            schema: mySchema,
            autoMigrate: false,
            statics: {
              countAllDocuments: () => Promise.resolve(1)
            }
          }
        });
        var myCollection = myCollections.humans;
        await myCollection.countAllDocuments();
      });
      it('use options', async () => {
        var myDb = await createRxDatabase({
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false,
          options: {
            foo1: 'bar1'
          }
        });
        var mySchema = schemas.human;
        var myCollections = await myDb.addCollections({
          humans: {
            schema: mySchema,
            autoMigrate: false,
            options: {
              foo2: 'bar2'
            }
          }
        });
        var x = myDb.options.foo1;
        var y = myCollections.humans.options.foo2;
        myDb.destroy();
      });
    });
    describe('negative', () => {
      it('should not allow wrong collection-settings', async () => {
        var myDb = await createRxDatabase({
          name: 'mydb',
          storage: getRxStorageMemory(),
          multiInstance: false,
          ignoreDuplicate: false
        });
        await myDb.addCollections({
          humans: {
            // @ts-expect-error because of wrong schema format
            schema: {},
            autoMigrate: false
          }
        });
        await myDb.destroy();
      });
    });
  });
  describe('change-event', () => {
    it('.insert$ .update$ .remove$', async () => {
      var myDb = await createRxDatabase({
        name: 'mydb',
        storage: getRxStorageMemory(),
        multiInstance: false,
        ignoreDuplicate: false
      });
      var mySchema = schemas.human;
      var myCollections = await myDb.addCollections({
        humans: {
          schema: mySchema,
          autoMigrate: false
        }
      });
      var names = [];
      var revs = [];
      var sub1 = myCollections.humans.insert$.subscribe(cE => {
        names.push(cE.documentData.firstName);
        revs.push(cE.documentData._rev);
      });
    });
  });
  describe('document', () => {
    it('should know the fields of the document', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          autoMigrate: false
        }
      });
      var result = await myCollections.humans.findOne().exec();
      if (result === null) throw new Error('got no document');
      var oneDoc = result;
      var id = oneDoc.passportId;
      var prim = oneDoc.primary;
      var otherResult = await myCollections.humans.findOne().exec();
      if (otherResult === null) throw new Error('got no other document');
      var otherDoc = otherResult;
      var id2 = otherDoc.passportId;
    });
    it('.putAttachment()', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          autoMigrate: false
        }
      });
      var result = await myCollections.humans.findOne().exec(true);
      var oneDoc = result;
      var attachment = await oneDoc.putAttachment({
        id: 'cat.txt',
        data: createBlob('foo bar', 'text/plain'),
        type: 'text/plain'
      });
    });
    it('.toJSON() should have _rev', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          autoMigrate: false
        }
      });
      var result = await myCollections.humans.findOne().exec(true);
      var rev = result.toJSON(true)._rev;
    });
    it('.toJSON(false) should not have _rev', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          autoMigrate: false
        }
      });
      var collection = myCollections.humans;
      var result = await collection.findOne().exec(true);

      // @ts-expect-error must not have _rev
      var rev = result.toJSON(false)._rev;
    });
    it('.incrementalModify()', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          autoMigrate: false
        }
      });
      var collection = myCollections.humans;
      var doc = await collection.findOne().exec(true);
      await doc.incrementalModify(docData => {
        var newData = {
          age: 23,
          firstName: 'bar',
          lastName: 'steve',
          passportId: 'lolol'
        };
        return newData;
      });
    });
  });
});
describe('local documents', () => {
  it('should allow to type input data', async () => {
    var myDb = {};
    var typedLocalDoc = await myDb.getLocal('foobar');

    // @ts-expect-error does not have 'bar'
    var typedLocalDocInsert = await myDb.insertLocal('foobar', {
      bar: 'foo'
    });
    if (!typedLocalDoc) {
      throw new Error('local doc missing');
    }
  });
  it('should allow to type the return data', async () => {
    var myDb = {};
    var typedLocalDoc = await myDb.getLocal('foobar');
    var typedLocalDocUpsert = await myDb.upsertLocal('foobar', {
      foo: 'bar'
    });
    if (!typedLocalDoc) {
      throw new Error('local doc missing');
    }
    var x = typedLocalDoc.get('data').foo;
    var x2 = typedLocalDocUpsert.get('data').foo;
  });
  it('should allow to access different property', async () => {
    var myDb = {};
    var typedLocalDoc = await myDb.getLocal('foobar');
    if (typedLocalDoc) {
      // @ts-expect-error must not have 'bar'
      var x = typedLocalDoc._data.bar;
    }
  });
});
describe('other', () => {
  describe('orm', () => {
    it('should correctly recognize orm-methods', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {},
          methods: {
            foobar() {
              return 'foobar';
            }
          }
        }
      });
      var myCollection = myCollections.humans;

      // via insert
      var doc = await myCollection.insert({
        passportId: 'asdf',
        age: 10
      });
      var x = doc.foobar();

      // via query findOne()
      var doc2 = await myCollection.findOne('asdf').exec(true);
      var x2 = doc.foobar();
    });
  });
  describe('hooks', () => {
    it('should know the types', async () => {
      var myDb = {};
      var myCollections = await myDb.addCollections({
        humans: {
          schema: {}
        }
      });
      var myCollection = myCollections.humans;
      var myNumber;
      var myString;
      myCollection.postInsert((data, doc) => {
        myNumber = doc.age;
        myNumber = data.age;
        myString = doc.foobar();
        return Promise.resolve();
      }, true);
    });
    describe('query', () => {
      it('should know the where-fields', async () => {
        var myDb = {};
        var myCollections = await myDb.addCollections({
          humans: {
            schema: {},
            autoMigrate: false
          }
        });
        var myCollection = myCollections.humans;
        var query = myCollection.findOne().where('nestedObject.foo').eq('foobar');
      });
      describe('rx-error', () => {
        it('should know the parameters of the error', async () => {
          var myDb = {};
          var myCollections = await myDb.addCollections({
            humans: {
              schema: {},
              autoMigrate: false
            }
          });
          try {
            await myCollections.humans.insert({
              age: 4
            });
          } catch (err) {
            if (err.rxdb) {
              assert.ok(err.parameters.errors);
            } else {
              // handle regular Error class
            }
          }
        });
      });
      describe('addRxPlugin', () => {
        it('should be a valid RxPlugin', () => {
          var myPlugin = {
            name: 'my-plugin',
            rxdb: true,
            prototypes: {
              RxDocument: () => {}
            }
          };
          addRxPlugin(myPlugin);
        });
      });
      describe('issues', () => {
        it('via gitter at 2018 Mai 22 19:20', () => {
          var db = {};
          var heroSchema = {
            version: 0,
            type: 'object',
            primaryKey: 'id',
            properties: {
              id: {
                type: 'string'
              }
            },
            required: ['color']
          };
          var colCreator = {
            schema: heroSchema
          };
        });
        it('nested selector type not working', () => {
          var collection = {};
          var query = collection.find({
            selector: {
              'meta.user': 'foobar',
              id: {
                $exists: true
              },
              timestamp: {
                $exists: true,
                $gt: 1000
              }
            },
            limit: 10,
            sort: [{
              id: 'asc'
            }, {
              timestamp: 'asc'
            }]
          });
        });
      });
    });
  });
});
//# sourceMappingURL=typings.test.js.map