var expect = require('chai').expect;
var BobbyTables = require('../lib/index');
var mocks = require('./mockApiRequest');

describe('BobbyTables',function() {
    var datastoreManager = null;
    this.timeout(10000);

    beforeEach(function() {
        mocks.mockApiRepository.clear();
        datastoreManager = new BobbyTables(
        'apiToken',{ ApiRequest: mocks.MockApiRequest });
    });

    afterEach(function() {
    });

   
    it('Can get or create datastores',function(done) {
        mocks.mockApiRepository.addMockRequest(
            'POST',
            'get_or_create_datastore',
            {"dsid":"test"},
            {"statusCode":200,"body":{"handle": "3Cq5ybudNmPHeWygNSkf73xPF25kmC", "rev": 3, "created": false}});

        datastoreManager.getOrCreate('test',function(err,store) {
            if (err) {
                done(err);
                return;
            }

            try
            {
                expect(store).to.exist;
                expect(store.id).to.equal('test');
                expect(store.handle).to.equal("3Cq5ybudNmPHeWygNSkf73xPF25kmC");
                // dropbox said the rev was 3, but we haven't pulled those changes
                // locally yet - so the rev should still be 0
                expect(store.rev).to.equal(0);
                done();
            }
            catch (e)
            {
                done(e);
            }
        });
    });

    it('Can list, load, & save datastores',function(done) {
        mocks.mockApiRepository.addMockRequest(
            'POST',
            'list_datastores',
            {},
            {"statusCode":200,"body":{"datastores":[{"info":{"mtime":{"T":"1409029942719"}},"handle":"S3PZkSHSN5hdl48RWCXMPHOeBVv92A","rev":1,"dsid":"default"}],"token":"c61d0e3064a2bb61f6935962cdd9ad4dd91add9c526c9948995de36d519bd285"}});

        datastoreManager.list(function(err,datastores) {
            if (err) {
                done(err);
                return;
            }

            try 
            {
                expect(datastores.default).to.exist;
                var store = datastores.default;
                expect(store.id).to.equal('default');

                var json = store.save();
                datastoreManager.load(json,function(err,loadedStore) {
                    if (err) {
                        done(err);
                        return;
                    }

                    try
                    {
                        expect(loadedStore).to.exist;
                        expect(loadedStore.id).to.equal('default');
                        done();
                    }
                    catch (e) 
                    {
                        done(e);
                    }
                });
            }
            catch (e) 
            {
                done(e);
            }
        });
    });

    it('Can insert and data',function(done) {
        mocks.mockApiRepository.addMockRequest(
            'POST',
            'get_or_create_datastore',
            {"dsid":"test"},
            {"statusCode":200,"body":{"handle": "3Cq5ybudNmPHeWygNSkf73xPF25kmC", "rev": 3, "created": false}});

        mocks.mockApiRepository.addMockRequest(
            'POST',
            'get_snapshot',
            {"handle":"3Cq5ybudNmPHeWygNSkf73xPF25kmC"},
            {"statusCode":200,"body":{"rows":[{"tid":"testobjs","data":{"Id":"1","Value":"hello"},"rowid":"1"},{"tid":"testobjs","data":{"Id":"2","Value":"world"},"rowid":"2"}],"rev":3}});

        mocks.mockApiRepository.addMockRequest(
            'POST',
            'put_delta',
            {"handle":"3Cq5ybudNmPHeWygNSkf73xPF25kmC","rev":3,"changes":"[[\"I\",\"test\",\"xxx\",{\"id\":\"xxx\",\"intVal\":{\"I\":\"1\"},\"floatVal\":2.1,\"strVal\":\"hello\",\"dateVal\":{\"T\":\"0\"}}]]"},
            {"statusCode":200,"body":{"rev":4}});

        datastoreManager.getOrCreate('test',function(err,store) {
            if (err) {
                done(err);
                return;
            }

            store.pull(function(err,store) {
                if (err) {
                    done(err);
                    return;
                }

                store.transaction(function(store,commit) {
                    var table = store.getTable('test');
                    table.insert({ 
                        id: 'xxx',
                        intVal: 1,
                        floatVal: 2.1,
                        strVal: 'hello',
                        dateVal: new Date(0)
                    });

                    commit();
                }).push({ retries: 1 },function(err,pushed) {
                    if (err) {
                        done(err);
                    }
                    else if (pushed) {
                        var table = store.getTable('test');
                        var value = table.get('xxx');
                        expect(value).to.exist
                        expect(value.id).to.equal('xxx');
                        expect(value.intVal).to.equal(1);
                        expect(value.floatVal).to.equal(2.1);
                        expect(value.strVal).to.equal('hello');
                        expect(value.dateVal.getTime()).to.equal(0);

                        done();
                    } else {
                        done('Could not push transaction data');
                    }
                });
            });
        });
    });
});

