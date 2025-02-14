/**
 * this test checks the integration with firestore
 * You need a running firebase backend
 */
import assert from 'assert';
import { randomCouchString, ensureNotFalsy, createRxDatabase } from '../plugins/core/index.mjs';
import * as firebase from 'firebase/app';
import { schemaObjects, humansCollection, ensureReplicationHasNoErrors, ensureCollectionsHaveEqualState, humanSchemaLiteral } from '../plugins/test-utils/index.mjs';
import { getFirestore, collection as getFirestoreCollection, connectFirestoreEmulator, getDocs, query, doc as DocRef, setDoc, serverTimestamp, where, orderBy, limit, getDoc } from 'firebase/firestore';
import { replicateFirestore } from '../plugins/replication-firestore/index.mjs';
import config from "./unit/config.js";
import { wrappedValidateZSchemaStorage } from '../plugins/validate-z-schema/index.mjs';

/**
 * The tests for the firestore replication plugin
 * do not run in the normal test suite
 * because it is too slow to setup the firestore backend emulators.
 */
describe('replication-firestore.test.ts', function () {
  this.timeout(1000 * 20);
  /**
   * Use a low batchSize in all tests
   * to make it easier to test boundaries.
   */
  var batchSize = 5;
  async function getAllDocsOfFirestore(firestore) {
    var result = await getDocs(query(firestore.collection));
    return result.docs.map(d => {
      var docData = d.data();
      docData.id = d.id;
      return docData;
    });
  }
  var projectId = randomCouchString(10);
  var app = firebase.initializeApp({
    projectId,
    databaseURL: 'http://localhost:8080?ns=' + projectId
  });
  var database = getFirestore(app);
  connectFirestoreEmulator(database, 'localhost', 8080);
  function getFirestoreState() {
    var useCollection = getFirestoreCollection(database, randomCouchString(10));
    return {
      projectId,
      collection: useCollection,
      database
    };
  }
  async function syncOnce(collection, firestoreState, options) {
    var replicationState = replicateFirestore({
      replicationIdentifier: firestoreState.projectId,
      collection,
      firestore: firestoreState,
      live: false,
      pull: options?.pull ?? {},
      push: options?.push ?? {}
    });
    ensureReplicationHasNoErrors(replicationState);
    await replicationState.awaitInitialReplication();
  }
  function syncFirestore(collection, firestoreState) {
    var replicationState = replicateFirestore({
      replicationIdentifier: randomCouchString(10),
      collection,
      firestore: firestoreState,
      pull: {
        batchSize
      },
      push: {
        batchSize
      }
    });
    ensureReplicationHasNoErrors(replicationState);
    return replicationState;
  }
  function makeFirestoreHumanDocument(human) {
    var firestoreHuman = {
      ...human
    };
    firestoreHuman.id = firestoreHuman.passportId;
    delete firestoreHuman.passportId;
    firestoreHuman.serverTimestamp = serverTimestamp();
    return firestoreHuman;
  }
  describe('preconditions', () => {
    it('query sorted by server timestamp', async () => {
      var firestoreState = await getFirestoreState();

      // it should be able to query sorted by serverTimestamp
      await setDoc(DocRef(firestoreState.collection, 'older'), {
        id: 'older',
        serverTimestamp: serverTimestamp()
      });
      await setDoc(DocRef(firestoreState.collection, 'younger'), {
        id: 'younger',
        serverTimestamp: serverTimestamp()
      });
      var docsOnServer = await getAllDocsOfFirestore(firestoreState);
      var olderDoc = ensureNotFalsy(docsOnServer.find(d => d.id === 'older'));
      var queryTimestamp = olderDoc.serverTimestamp.toDate();
      var newerQuery = query(firestoreState.collection, where('serverTimestamp', '>', queryTimestamp), orderBy('serverTimestamp', 'asc'), limit(10));
      var queryResult = await getDocs(newerQuery);
      assert.strictEqual(queryResult.docs.length, 1);
      assert.strictEqual(ensureNotFalsy(queryResult.docs[0]).data().id, 'younger');
    });
  });
  describe('live replication', () => {
    it('push replication to client-server', async () => {
      var collection = await humansCollection.createHumanWithTimestamp(2, undefined, false);
      var firestoreState = await getFirestoreState();
      var replicationState = syncFirestore(collection, firestoreState);
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();
      var docsOnServer = await getAllDocsOfFirestore(firestoreState);
      assert.strictEqual(docsOnServer.length, 2);

      // insert another one
      await collection.insert(schemaObjects.humanWithTimestampData());
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfFirestore(firestoreState);
      assert.strictEqual(docsOnServer.length, 3);

      // update one
      var doc = await collection.findOne().exec(true);
      await doc.incrementalPatch({
        age: 100
      });
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfFirestore(firestoreState);
      assert.strictEqual(docsOnServer.length, 3);
      var serverDoc = ensureNotFalsy(docsOnServer.find(d => d.id === doc.primary));
      assert.strictEqual(serverDoc.age, 100);

      // delete one
      await doc.getLatest().remove();
      await replicationState.awaitInSync();
      docsOnServer = await getAllDocsOfFirestore(firestoreState);
      // must still have 3 because there are no hard deletes
      assert.strictEqual(docsOnServer.length, 3);
      assert.ok(docsOnServer.find(d => d._deleted));
      collection.database.destroy();
    });
    it('two collections', async () => {
      var collectionA = await humansCollection.createHumanWithTimestamp(1, undefined, false);
      var collectionB = await humansCollection.createHumanWithTimestamp(1, undefined, false);
      var firestoreState = await getFirestoreState();
      var replicationStateA = syncFirestore(collectionA, firestoreState);
      ensureReplicationHasNoErrors(replicationStateA);
      await replicationStateA.awaitInitialReplication();
      var replicationStateB = syncFirestore(collectionB, firestoreState);
      ensureReplicationHasNoErrors(replicationStateB);
      await replicationStateB.awaitInitialReplication();
      await replicationStateA.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert one
      await collectionA.insert(schemaObjects.humanWithTimestampData({
        id: 'insert',
        name: 'InsertName'
      }));
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // delete one
      await collectionB.findOne().remove();
      await replicationStateB.awaitInSync();
      await replicationStateA.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert many
      await collectionA.bulkInsert(new Array(10).fill(0).map(() => schemaObjects.humanWithTimestampData({
        name: 'insert-many'
      })));
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);

      // insert at both collections at the same time
      await Promise.all([collectionA.insert(schemaObjects.humanWithTimestampData({
        name: 'insert-parallel-A'
      })), collectionB.insert(schemaObjects.humanWithTimestampData({
        name: 'insert-parallel-B'
      }))]);
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await replicationStateA.awaitInSync();
      await replicationStateB.awaitInSync();
      await ensureCollectionsHaveEqualState(collectionA, collectionB);
      collectionA.database.destroy();
      collectionB.database.destroy();
    });
  });
  describe('conflict handling', () => {
    it('should keep the master state as default conflict handler', async () => {
      var firestoreState = await getFirestoreState();
      var c1 = await humansCollection.create(1);
      var c2 = await humansCollection.create(0);
      await syncOnce(c1, firestoreState);
      await syncOnce(c2, firestoreState);
      var doc1 = await c1.findOne().exec(true);
      var doc2 = await c2.findOne().exec(true);

      // make update on both sides
      await doc1.incrementalPatch({
        firstName: 'c1'
      });
      await doc2.incrementalPatch({
        firstName: 'c2'
      });
      await syncOnce(c2, firestoreState);

      // cause conflict
      await syncOnce(c1, firestoreState);

      /**
       * Must have kept the master state c2
       */
      assert.strictEqual(doc1.getLatest().firstName, 'c2');
      c1.database.destroy();
      c2.database.destroy();
    });
  });
  describe('filtered replication', () => {
    it('should only sync filtered documents from firestore', async () => {
      var firestoreState = getFirestoreState();
      var h1 = makeFirestoreHumanDocument(schemaObjects.humanData('replicated', 35, 'replicated'));
      var h2 = makeFirestoreHumanDocument(schemaObjects.humanData('not replicated', 27, 'not replicated'));
      await setDoc(DocRef(firestoreState.collection, 'replicated'), h1);
      await setDoc(DocRef(firestoreState.collection, 'not replicated'), h2);
      var collection = await humansCollection.create(0);
      await syncOnce(collection, firestoreState, {
        pull: {
          filter: where('firstName', '==', 'replicated')
        },
        push: {}
      });
      var allLocalDocs = await collection.find().exec();
      assert.strictEqual(allLocalDocs.length, 1);
      assert.strictEqual(allLocalDocs[0].passportId, 'replicated');
      collection.database.destroy();
    });
    it('should only sync filtered documents to firestore', async () => {
      var firestoreState = getFirestoreState();
      var collection = await humansCollection.create(0);
      await collection.insert(schemaObjects.humanData('replicated', 35, 'filtered-replication-c2s-1'));
      await collection.insert(schemaObjects.humanData('not replicated', 27, 'filtered-replication-c2s-2'));
      await syncOnce(collection, firestoreState, {
        pull: {},
        push: {
          filter(human) {
            return human.age > 30;
          }
        }
      });
      var docsOnServer = await getAllDocsOfFirestore(firestoreState);
      assert.strictEqual(docsOnServer.length, 1);
      assert.strictEqual(docsOnServer[0].id, 'replicated');
      collection.database.destroy();
    });
  });
  describe('issues', () => {
    it('#4698 adding items quickly does not send them to the server', async () => {
      var name = randomCouchString(10);
      var db = await createRxDatabase({
        name,
        storage: config.storage.getStorage(),
        eventReduce: true,
        ignoreDuplicate: true
      });

      // create a collection
      var collections = await db.addCollections({
        mycollection: {
          schema: humanSchemaLiteral
        }
      });
      var firestoreState = getFirestoreState();
      var replicationState = replicateFirestore({
        replicationIdentifier: firestoreState.projectId,
        firestore: firestoreState,
        collection: db.collections.mycollection,
        pull: {},
        push: {},
        live: true
      });
      ensureReplicationHasNoErrors(replicationState);

      // insert a document
      var doc = await collections.mycollection.insert({
        passportId: 'foobar',
        firstName: 'Bob',
        lastName: 'Kelso',
        age: 56
      });
      await replicationState.awaitInitialReplication();
      await doc.incrementalPatch({
        age: 60
      });
      await doc.incrementalPatch({
        age: 30
      });
      await replicationState.awaitInSync();

      // ensure correct local value
      var myDocument = await collections.mycollection.findOne({
        selector: {
          passportId: 'foobar'
        }
      }).exec();
      assert.strictEqual(myDocument.age, 30);

      // ensure correct remote value
      var docRef = DocRef(firestoreState.collection, 'foobar');
      var docSnap = ensureNotFalsy(await getDoc(docRef));
      assert.strictEqual(ensureNotFalsy(docSnap.data()).age, 30);
      db.destroy();
    });
    it('#5572 firestore replication not working with schema validation', async () => {
      var collection = await humansCollection.create(0, undefined, undefined, undefined, wrappedValidateZSchemaStorage({
        storage: config.storage.getStorage()
      }));
      var firestoreState = getFirestoreState();
      var replicationState = replicateFirestore({
        replicationIdentifier: firestoreState.projectId,
        firestore: firestoreState,
        collection,
        pull: {},
        push: {},
        live: true
      });
      ensureReplicationHasNoErrors(replicationState);
      await replicationState.awaitInitialReplication();
      var doc = await collection.insert(schemaObjects.humanData('foobar'));
      await replicationState.awaitInSync();
      await doc.incrementalPatch({
        age: 30
      });
      await replicationState.awaitInSync();
      var myDocument = await collection.findOne({
        selector: {
          passportId: 'foobar'
        }
      }).exec(true);
      assert.strictEqual(myDocument.age, 30);
      var docRef = DocRef(firestoreState.collection, 'foobar');
      var docSnap = ensureNotFalsy(await getDoc(docRef));
      assert.strictEqual(ensureNotFalsy(docSnap.data()).age, 30);
      collection.database.destroy();
    });
  });
});
//# sourceMappingURL=replication-firestore.test.js.map