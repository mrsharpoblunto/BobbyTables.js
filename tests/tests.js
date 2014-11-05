var expect = require('chai').expect;
var BobbyTables = require('../lib/index');
var mocks = require('./mockApiRequest');

describe('BobbyTables',function() {
    var datastoreManager = null;
    this.timeout(10000);

    beforeEach(function() {
        mocks.mockApiRepository.clear();
        datastoreManager = new BobbyTables('apiToken',{ ApiRequest: mocks.MockApiRequest });
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
});

