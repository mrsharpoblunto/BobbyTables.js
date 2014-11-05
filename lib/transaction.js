module.exports = function(datastore,actions)
{
    this._datastore = datastore;
    this._actions = actions;
};

module.exports.prototype.push = function(opts,callback)
{
    if (arguments.length === 1) {
        callback = opts;
        opts = { retries : 1 };
    }

    this._push(opts.retries,callback);
};

module.exports.prototype._push = function(retries,callback) 
{
    if (!retries) {
        callback(null,false);
        return;
    }

    var self = this;
    try 
    {
        this._actions(function() {
             self._datastore.push(function(err,pushed) {
                if (err) {
                    callback(e,null);
                    return;
                }

                if (!pushed) {
                    self._push(retries-1,callback);
                } else {
                    callback(null,true);
                }
             });
        });
    } 
    catch (e)
    {
        callback(e,null);
    }
}
