module.exports = {};

var mockApiRepository = {
    _urls: {}
};

module.exports.mockApiRepository = mockApiRepository;

mockApiRepository.addMockRequest = function(method,url,params,response)
{
    var request = this._urls[method+':'+url];
    if (!request) {
        request = {
            responses: []
        }
        this._urls[method+':'+url] = request;
    }
    for (var i = 0;i < request.responses.length; ++i) {
        if ((!params && !request.responses[i].params) 
        || JSON.stringify(params) === JSON.stringify(request.responses[i].params)) {
            request.responses[i].response = response;
            return;
        }
    }
    request.responses.push({
        params: params,
        response: response
    });
};

mockApiRepository.clear = function() 
{
    this._urls = {};
}

module.exports.MockApiRequest = function(method,url,apiToken) {
    this._method = method;
    this._url = url;
    this._params = {};
};

module.exports.MockApiRequest.prototype.addHeader = function(name,value) {
    this._headers[name] = value;
    return this;
};

module.exports.MockApiRequest.prototype.addParam = function(name,value)
{
    this._params[name] = value;
    return this;
};

module.exports.MockApiRequest.prototype.getResponse = function(callback)
{

    var request = mockApiRepository._urls[this._method + ':' + this._url];

    if (!request) {
        callback(null,{ statusCode: 404, body: null });
        return;
    }

    
    for (var i = 0;i < request.responses.length; ++i) {
        if (JSON.stringify(this._params) === JSON.stringify(request.responses[i].params)) {
            callback(null,request.responses[i].response);
            return;
        }
    }
    callback(null,{ statusCode: 500, body: null });
};
