var request = require('request');

var apiBase = "https://api.dropbox.com/1/datastores/";

module.exports = function(method,url,apiToken,opts) {
    this._method = method;
    this._url = apiBase + url;
    this._params = {};
    this._apiToken = apiToken;
    this._headers = {
        'accept': 'application/json, text/javascript'
    };
    this.opts = opts || {
        debug: false
    };
};

module.exports.prototype.addHeader = function(name,value) {
    this._headers[name] = value;
    return this;
};

module.exports.prototype.addParam = function(name,value)
{
    this._params[name] = value;
    return this;
};

module.exports.prototype.getResponse = function(callback)
{
    var req = {
        url: this._url,
        auth: {
            bearer: this._apiToken
        },
        headers: this._headers
    };

    if (this._method !== 'GET') {
        req.form = this._params;
    }

    var self = this;
    request[this._method.toLowerCase()](req,function(err,httpResponse,body) {
        if (err) {
            callback(err,null);
            return;
        }

        var resp = {
            statusCode: httpResponse.statusCode,
            body: JSON.parse(body)
        };

        if (self.opts.debug) {
            console.log('Request: '+req.url);
            console.log('Params: '+JSON.stringify(req.form));
            console.log('Response: ' + JSON.stringify(resp));
        }
        callback(null,resp);
    });
};
