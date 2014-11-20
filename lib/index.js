/**
@license BobbyTables.js | (c) Glenn Conner. | https://github.com/mrsharpoblunto/bobbytables.js/blob/master/LICENSE
*/
var crypto = require('crypto');
var ApiRequest = require('./apiRequest');
var Datastore = require('./datastore');

module.exports = function(apiToken,opts)
{
    // allow mocking out of the api request object
    if (opts) {
        this._ApiRequest = opts.ApiRequest || ApiRequest;
    }

	this.apiToken = apiToken;
	this._datastores = {};
    this._keyRegex = /[-_A-Za-z0-9]{32,10000}/;
    this._token = null;
};


module.exports.prototype.get = function(id,opts,callback)
{
    if (arguments.length === 2) {
        callback = opts;
        opts = { forceRefresh: false };
    }

    var store = this._datastores[id];
    if (!store || opts.forceRefresh) {
        var request = new this._ApiRequest("POST","get_datastore", this._apiToken);
        request.addParam("dsid",id);
        var self = this;
        request.getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }

            try 
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call get_datastore returned status code '+response.statusCode);
                }

                if (response.body.notfound) {
                    if (store) {
                        delete self._datastores[id];
                    }
                    callback(null,null);
                }

                store = new Datastore(self,id,response.body.handle);
                self._datastores[id] = store;
                callback(null,store);
            }
            catch (e) {
                callback(e,null);
            }
        });
    } else {
        callback(null,store);
    }
};

module.exports.prototype.list = function(opts,callback)
{
    if (arguments.length === 1) {
        callback = opts;
        opts = { forceRefresh: false };
    }
    if (!this._token || opts.forceRefresh) {
        var request = new this._ApiRequest("POST","list_datastores",this.apiToken);
        var self = this;
        request.getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }
            try
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call list_datastores returned status code ' + response.statusCode);
                }
                self._listDatastores(response.body);
                callback(null,self._datastores);
            }
            catch (e)
            {
                callback(e,null);
            }
        });
    }
    else {
        callback(null,this._datastores);
    }
};

module.exports.prototype._listDatastores = function(body)
{
    this._datastores = {};
    this._token = body.token;
    var newStore = null;
    for (var i = 0; i < body.datastores.length; ++i) {
        var datastore = body.datastores[i];
        if (!this._datastores[datastore.dsid]) {
            newStore = new Datastore(this,datastore.dsid,datastore.handle);
            this._datastores[datastore.dsid] = newStore;
        }
        if (datastore.info) {
            if (datastore.info.title) {
                newStore.title = datastore.info.title;
            }
            if (datastore.info.mtime) {
                newStore.modified = new Date(datastore.info.mtime.T);
            }
        }
    }
};

module.exports.prototype.awaitListChanges = function(callback) {
    var url = 'await?list_datastores=' + encodeURIComponent(JSON.stringify({token:this._token}));
    var request = new this._ApiRequest("GET",url,this.apiToken);
    var self = this;
    request.getResponse(function(err,response) {
        if (err) {
            callback(err,null);
            return;
        }

        try
        {
            if (response.statusCode !== 200) {
                throw new Error('Api call await returned status code ' + response.statusCode);
            }

            var datastores = response.body.list_datastores;
            if (datastores) {
                self._listDatastores(datastores);
                callback(null,true);
            }
            else {
                callback(null,false);
            }
        }
        catch (e)
        {
            callback(e,null);
        }
    });
};

module.exports.prototype.awaitDatastoreChanges = function(callback) {
    var self = this;
    this.list(function(err,datastores) {
        if (err) {
            callback(err,null);
            return;
        }

        var args= {
            cursors: {}
        };
        for (var key in datastores) {
            if (datastores.hasOwnProperty(key)) {
                args.cursors[datastores[key].handle] = datastores[key].rev;
            }
        }

        var url = 'await?get_deltas=' + encodeURIComponent(JSON.stringify(args));
        var request = new this._ApiRequest('GET',url,self.apiToken);
        request.getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }

            try 
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call await returned status code ' + response.statusCode);
                }

                var changed = [];
                if (response.body.get_deltas) {
                    var allDeltas = response.body.get_deltas.deltas;
                    for (var key in datastores) {
                        if (datastores.hasOwnProperty(key)) {
                            var store = datastores[key];
                            var delta = allDeltas[store.handle];
                            if (delta && !delta.notfoundresult) {
                                store._applyChanges(delta);
                                changed.push(store);
                            }
                        }
                    }
                }
                callback(null,changed);
            }
            catch (e)
            {
                callback(e,null);
            }
        });

    });
};

module.exports.prototype.getOrCreate = function(id,opts,callback)
{
    if (arguments.length === 2) {
        callback = opts;
        opts = { forceRefresh: false };
    }

    var self = this;
    var store = this._datastores[id];
    if (!store || opts.forceRefresh) {
        var request = new this._ApiRequest('POST','get_or_create_datastore',this.apiToken);
        request.addParam('dsid',id);
        request.getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }

            try 
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call await returned status code ' + response.statusCode);
                }
                store = new Datastore(self,id,response.body.handle);
                self._datastores[id] = store;
                callback(null,store);
            }
            catch (e) 
            {
                callback(e,null);
            }
        });
    } else {
        callback(null,store);
    }
};

module.exports.prototype.create = function(key,callback)
{
    if (!key.match(this._keyRegex)) {
        callback(new Error('Key did not match regex '+this.keyRegex));
        return;
    }

    var shaSum = crypto.createHash('sha256');
    shaSum.update(key,'utf8');
    var id = '.'+shaSum.digest('base64');

    if (this._datastores[id]) {
       callback(new Error('Datastore with id ' + id + ' already exists', null));
       return;
    }

    var self = this;
    var request = new this._ApiRequest('POST','create_datastore', this.apiToken);
    request.addParam('dsid',id).addParam('key',key);
    request.getResponse(function(err,response) {
        if (err) {
            callback(err,null);
            return;
        }

        if (response.statusCode !== 200) {
            callback(new Error('Api call create_datastore returned status code '+response.statusCode),null);
            return;
        }

        if (response.body.notfound) {
            callback(new Error('Datastore with key '+key +' (id ' + id + ') not found'),null);
            return;
        }

        try 
        {
            var store = new Datastore(self,id,response.body.handle);
            self._datastores[id] = store;
            callback(null,{
                id: id,
                datastore: store
            });
        }
        catch (err)
        {
            callback(err,null);
        }
    });
};

module.exports.prototype.remove = function(store,callback) {
    var self = this;
    var request = new ApiRequest('POST','delete_datastore',this.apiToken);
    request.addParam('handle',store.handle);
    request.getResponse(function(err,response) {
        if (response.statusCode !== 200) {
            callback(new Error('Api call create_datastore returned status code '+response.statusCode),null);
            return;
        }

        if (response.body.notfound) {
            callback(new Error('Datastore with id ' + store.id + ' not found'),null);
            return;
        }

        delete self._datastores[store.id];
        callback(null,response.body.ok===true);
    });
};

module.exports.prototype.load = function(json,callback) {
    try 
    {
        var store = new Datastore(this,json);
        this._datastores[store.id] = store;
        callback(null,store);
    }
    catch (err) {
        callback(err,null);
    }
};


