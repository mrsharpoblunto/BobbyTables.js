var Table = require('./table');
var Transaction = require('./transaction');

module.exports = function(manager,id,handle)
{
    this._manager = manager;
    this._tables = {};
    
    if (arguments.length == 2) {
        load(this,id);
    } else {
        this.id = id;
        this.handle = handle;
        this.rev = 0;
    }
};

function load(datastore,json)
{
    datastore.id = json.id;
    datastore.handle = json.handle;
    datastore.rev = json.rev;
    for (var key in json.tables) {
        var table = new Table(datastore,key);
        table._load(json[key]);
        datastore._tables[key] = table;
    }
}

module.exports.prototype.save = function() {
    var json = {};
    json.id = this.id;
    json.handle = this.handle;
    json.rev = this.rev;
    json.tables = {};
    for (var key in this._tables) {
       json.tables[key] = this._tables._save();
    }
    return json;
};

module.exports.prototype.revert = function() {
    for (var key in this._tables) {
        this._tables[key]._revertPendingChanges();
    }
};

module.exports.prototype.pull = function(callback) {
    for (var key in this._tables) {
        if (this._tables[key]._hasPendingChanges()) {
            callback(new Error('Unable to pull in remote changes to datastore with id ' + this.id + ' as it has local changes pending'),null);
            return;
        }
    }

    var self = this;
    if (this.rev === 0) {
        var request = new this._manager._ApiRequest('POST','get_snapshot',this._manager.apiToken);
        request.addParam('handle',this.handle).getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }

            try
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call get_snapshot returned status code '+response.statusCode);
                }

                if (response.body.notfound) {
                    throw new Error('Datastore with id '+self.id+' not found');
                }

                self.rev = response.body.rev;
                var rows = response.body.rows;
                for (var i = 0;i < rows.length;++i) {
                    var row = rows[i];
                    var table = self._tables[row.tid];
                    if (!table) {
                        table = new Table(self,row.tid);
                        self._tables[row.tid] = table;
                    }
                    table._insert(row.rowid,row.data);
                }
                callback(null,self);
            }
            catch (e) {
                callback(e,null);
            }
        });
    } else {
        var request = new this._manager._ApiRequest('POST','get_deltas',this._manager.apiToken);
        request.addParam('handle',this.handle).addParam('rev',this.rev).getResponse(function(err,response) {
            if (err) {
                callback(err,null);
                return;
            }

            try
            {
                if (response.statusCode !== 200) {
                    throw new Error('Api call get_snapshot returned status code '+response.statusCode);
                }

                if (response.body.notfound) {
                    throw new Error('Datastore with id '+self.id+' not found');
                }

                self._applyChanges(response.body);
                callback(null,self);
            }
            catch (e) {
                callback(e,null);
            }
        });
    }
};

module.exports.prototype._applyChanges = function(body)
{
    if (!body.deltas) return;

    for (var i = 0;i < body.deltas.length; ++i) {
        var delta = body.deltas[i];
        if (delta.rev < this.rev) continue;
        this.rev = delta.rev + 1;
        for (var j = 0;j < delta.changes.length;++j) {
            var tid = delta.changes[i][1];
            var rowid = delta.changes[i][2];

            var table = self._tables[tid];
            if (!table) {
                table = new Table(self,tid);
                self._tables[tid] = table;
            }
            table._applyChange(delta.changes[i]);
        }
    }
};

module.exports.prototype.awaitPull = function(callback)
{
    for (var key in this._tables) {
        if (this._tables[key]._hasPendingChanges()) {
            callback(new Error('Unable to pull in remote changes to datastore with id ' + this.id + ' as it has local changes pending'),null);
            return;
        }
    }

    var args = { cursors: { } };
    args.cursors[this.handle] = rev;
    var self = this;

    var request= new this._manager._ApiRequest('GET','await?get_deltas=' + encodeURIComponent(JSON.stringify(args)));
    request.getResponse(function(err,response) {
        if (err) {
            callback(err,null);
            return;
        }

        try
        {
            if (response.statusCode !== 200) {
                throw new Error('Api call await returned status code '+response.statusCode);
            }

            if (response.body.get_deltas) {
                var result = response.body.get_deltas.deltas[self.handle];
                
                if (result.notfound) {
                    throw new Error('Datastore with id '+self.id+' not found, or was deleted');
                }
                self._applyChanges(result);
                callback(null,true);
            }
            else {
                callback(null,false);
            }
        }
        catch (e) {
            callback(e,null);
        }
    });
};

module.exports.prototype.push = function(callback) {
    var args= [];
    for (var key in this._tables) {
        var changes = this._tables[key]._pendingChanges;
        args = args.concat(changes);
    }

    var self = this;
    var request = new this._manager._ApiRequest('POST','put_delta',this._manager.apiToken);
    request
        .addParam('handle',this.handle)
        .addParam('rev',this.rev)
        .addParam('changes',JSON.stringify(args));

    request.getResponse(function(err,response) {
        if (err) {
            callback(err,null);
            return;
        }

        try 
        {
            if (response.statusCode !== 200) {
                throw new Error('Api call put_delta returned status code '+response.statusCode);
            }

            if (response.body.notfoundresult) {
                throw new Error('Datastore '+self.handle+' not found');
            }

            if (response.body.conflict) {
                callback(null,false);
                return;
            }

            self.rev = response.body.rev;

            for (var key in self._tables) {
                var table = self._tables[key];
                table._applyPendingChanges();
            }
            callback(null,true);
        }
        catch (e) {
            callback(e,null);
        }
    });
};

module.exports.prototype.transaction = function(actions)
{
    return new Transaction(this,actions);
};

module.exports.prototype.getTable = function(id)
{
    var table = this._tables[id];
    if (!table) {
        table = new Table(this,id);
        this._tables[id] = table;
    }
    return table;
};

