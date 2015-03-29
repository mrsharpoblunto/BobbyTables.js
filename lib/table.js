var shortId = require('shortid');

var RowState = {
    UNCHANGED: 0,
    DELETING: 1,
    UPDATING: 2
};

module.exports = function(datastore,id)
{
    this._datastore = datastore;
    this.id = id;
    this._rows = {};
    this._pendingChanges = [];
};

module.exports.prototype._load = function(json)
{
    for (var key in json) {
        if (json.hasOwnProperty(key)) {
            this._rows[key] = {
                state: RowState.UNCHANGED,
                data: json[key]
            };
        }
    }
};

module.exports.prototype._save = function()
{
    var rows = {};
    for (var key in this._rows) {
        if (this._rows.hasOwnProperty(key)) {
            rows[key] = this._rows[key].data;
        }
    }
    return rows;
};

module.exports.prototype._hasPendingChanges = function()
{
    return this._pendingChanges.length > 0;
};

module.exports.prototype._revertPendingChanges = function()
{
    for (var i = 0; i < this._pendingChange.length; ++i) {
        var rowId = this._pendingChange[2];
        var row = this._rows[rowId];
        if (row) {
            row.state = RowState.UNCHANGED;
            if (row.data===null) {
                delete this._rows[rowId];
            }
        }
    }
    this._pendingChanges = [];
};

module.exports.prototype._applyPendingChanges = function()
{
    for (var i = 0; i < this._pendingChanges.length; ++i) {
        this._applyChange(this._pendingChanges[i]);
    }
    this._pendingChanges = [];
};

module.exports.prototype._applyChange = function(change)
{
    var type = change[0];
    var rowId = change[2];

    var row = this._rows[rowId];
    switch (type)
    {
        case "I":
        {
            if (row) {
                if (row.data!==null) {
                    throw new Error('Cannot insert row '+rowId+' as it already exists and has a value');
                }
            } else {
                this._rows[rowId] = {
                    state: RowState.UNCHANGED,
                    data: null
                };
            }
            if (typeof change[change.length-1] !=='object') {
                throw new Error('Expected last property of insert row '+rowId+ ' to be object, but was '+typeof change[change.length -1 ] );
            } else {
                row.data = change[change.length - 1];
            }
            row.state = RowState.UNCHANGED;
        }
        break;

        case "D":
        {
            if (!row || row.data===null) {
                throw new Error('Cannot delete row '+rowId+ ' as it has already been deleted');
            }
            delete this._rows[rowId];
        }
        break;

        case "U":
        {
            if (!row || row.data===null) {
                throw new Error('Cannot update row '+rowId+' as it does not exist');
            }
            this._applyUpdate(row,change);
            row.state = RowState.UNCHANGED;
        }
        break;

        default:
            throw new Error('Unknown change type '+type);
    }
};

module.exports.prototype._applyUpdate = function(row,updates)
{
    var data = updates[updates.length - 1];

    for (var key in data) {
        if (!data.hasOwnProperty(key)) {
            continue;
        }

        var child = data[key];

        switch (child[0]) {
            case "P":
                row.data[key] = child[1];
                break;
            case "D":
                delete row.data[key];
                break;
            case "LC":
                row.data[key] = [];
                break;
            case "LP":
                row.data[key][child[1]] = child[2];
                break;
            case "LI":
                row.data[key].splice(child[1],0,child[2]);
                break;
            case "LD":
                row.data[key].splice(child[1],1);
                break;
            case "LM":
                {
                    var rowData = row.data[key];
                    var oldIndex = child[1];
                    var value = rowData[oldIndex];
                    rowData.splice(oldIndex,1);
                    rowData.splice(child[2],0,value);
                }
                break;
            default:
                throw new Error("Unknown fieldop type " + child[0]);
        }
    }
};

module.exports.prototype._insert = function(rowId, insert)
{
    this._rows[rowId] = {
        data: insert,
        state: RowState.UNCHANGED
    };
};

function defaultIdGetter(obj)
{
    if (typeof obj.id !=="string") {
        throw new Error('Object does not have a public string id field');
    }
    return obj.id;
}

function defaultIdSetter(obj,id)
{
    obj.id = id;
}

function getObjectId(obj,idGetter,idSetter)
{
    var id = idGetter(obj);
    if (idSetter && !id) {
        id = shortId.generate();
        idSetter(obj,id);
    }
    return id;
}

function toDBase64(buffer) 
{
    return buffer.toString('base64').replace(/\//g,'_').replace(/\+/g,'-').replace(/=/g,'');
}

function fromDBase64(str) 
{
    str = str.replace(/-/g,'+').replace(/_/g,'/');
    if (str.length % 4 !== 0) {
        str += ('==='.substr(0,4 - (str.length % 4)));
    }
    return new Buffer(str,'base64');
}

function serializeValue(value)
{
    if (value===null) {
        throw new Error('Unable to serialize null value to Atom');
    }

    else if (typeof value === "boolean" || typeof value === "string") {
        return value;
    }
    else if (typeof value === "number") {
        if (value % 1 === 0) {
            return { I: ''+value };
        } else {
            return value;
        }
    } else if (value instanceof Date) {
        return { T: ''+value.getTime() };
    } else if (value instanceof Buffer) {
        return { B: toDBase64(value) };
    } else if (value instanceof Array) {
        var array = [];
        for (var i = 0; i < value.length; ++i) {
            array.push(serializeValue(value[i]));
        }
        return array;
    }
    throw new Error('Unable to serialize type '+typeof type  + ' to Atom');
}

function serializedValuesEqual(a,b)
{
    if (typeof a !== typeof b ) {
        return false;
    }

    if (a instanceof Array) {
        if (a.length !== b.length) {
            return false;
        }
        for (var i = 0; i < a.length; ++i) {
            if (!serializedValuesEqual(a[i],b[i])) {
                return false;
            }
        }
        return true;
    }

    switch (typeof a ) {
        case "boolean":
        case "string":
        case "number":
            return a === b;
        case "object":
            if (typeof a.I  !== "undefined") {
                return a.I === b.I;
            } else if (typeof a.T  !== "undefined") {
                return a.T === b.T;
            } else if (typeof a.B  !== "undefined") {
                return a.B === b.B;
            } else {
                throw new Error('Unknown wrapped Atom type');
            }
            break;
    }
    throw new Error('Unexpected Atom type '+JSON.stringify(a));
}

function deserializeValue(a)
{
    if (a instanceof Array) {
        var array = [];
        for (var i = 0; i < a.length; ++i) {
            array.push(deserializeValue(a[i]));
        }
        return array;
    }

    switch (typeof a ) {
        case "object":
            if (typeof a.I  !== "undefined") {
                return parseInt(a.I);
            }
            else if (typeof a.T  !== "undefined") {
                return new Date(parseInt(a.T));
            } 
            else if (typeof a.B  !== "undefined") {
                return fromDBase64(a.B);
            }
            break;
        case "boolean":
        case "string":
        case "number":
            return a;
    }
    throw new Error('Unable to deserialize JSON type '+JSON.stringify(a));
}

module.exports.prototype.insert = function(insert,opts)
{
    opts = opts || {};
    opts.idGetter = opts.idGetter || defaultIdGetter;
    opts.idSetter = opts.idSetter || defaultIdSetter;

    var id = getObjectId(insert,opts.idGetter,opts.idSetter);
    if (!id) {
        throw new Error('Object to be inserted must have a non null/empty Id');
    }

    var row = this._rows[id];
    if (row) {
        // can't insert something unless it doesn't exist
        // or has just been deleted
        if (row.state !== RowState.DELETING) {
            return false;
        }
    } else {
        row = { data: null };
        this._rows[id] = row;
    }
    row.state = RowState.INSERTING;
        
    var change = [ "I", this.id, id ];
    var data = {};

    for (var key in insert) {
        if (insert.hasOwnProperty(key)) {
            data[key] = serializeValue(insert[key]);
        }
    }
    change.push(data);
    this._pendingChanges.push(change);
    return true;
};

module.exports.prototype.remove = function(id)
{
    var row = this._rows[id];
    if (row) {
        // can't delete something twice
        if (row.state === RowState.DELETING) {
            return false;
        }
        this._pendingChanges.push([ "D", this.id, id ]);
    }
    return false;
};

module.exports.prototype.get = function(id,opts)
{
    opts = opts || {};
    opts.idSetter = opts.idSetter || defaultIdSetter;

    var row = this._rows[id];
    if (row && row.data!==null) {
        var obj = {};
        opts.idSetter(obj,id);

        for (var key in row.data) {
            if (row.data.hasOwnProperty(key)) {
                obj[key] = deserializeValue(row.data[key]);
            }
        }
        return obj;
    }
    return null;
};

module.exports.prototype.getAll = function(opts)
{
    opts = opts || {};
    opts.idSetter = opts.idSetter || defaultIdSetter;

    var results = [];
    for (var key in this._rows) {
        if (this._rows.hasOwnProperty(key)) {
            results.push(this.get(key,opts));
        }
    }
    return results;
};

function backtrack(lcs,num,a,b,i,j) {
    if (serializedValuesEqual(a[i],b[j])) {
        if (i > 0 && j > 0) {
            backtrack(lcs,num,a,b,i-1,j-1);
        }
        lcs.push(a[i]);
    } else {
        if (j > 0 && (i === 0 || num[i][j-1] >= num[i-1][j])) {
            backtrack(lcs,num,a,b,i,j-1);
        } else if (i > 0 && (j === 0 || num[i][j-1] < num[i-1][j])) {
            backtrack(lcs,num,a,b,i-1,j);
        }
    }
}

function computeLCS(a,b) {
    var sequence = [];
    if (!a.length || !b.length) {
        return sequence;
    }

    var num = [];
    var i,j;
    for (i = 0; i < a.length; ++i) {
        var row = [];
        for (j = 0; j < b.length; ++j) {
            row.push(0);
        }
        num.push(row);
    }

    for (i = 0; i < a.length; ++i) {
        for (j =0; j < b.length; ++j) {

            if (serializedValuesEqual(a[i],b[j])) {
                if ((i === 0) || (j === 0)) {
                    num[i][j] = 1;
                } else {
                    num[i][j] = 1 + num[i-1][j-1];
                }
            } else {
                if (i === 0 && j === 0) {
                    num[i][j] = 0;
                } else if (i === 0 && j !== 0) {
                    num[i][j] = Math.max(0,num[i][j - 1]);
                } else if (i !== 0 && j === 0) {
                    num[i][j] = Math.max(num[i-1][j],0);
                } else if (i !== 0 && j !== 0) {
                    num[i][j] = Math.max(num[i-1][j],num[i][j -1]);
                }
            }
        }
    }

    backtrack(sequence,num,a,b,a.length -1,b.length - 1);
    return sequence;
}

function determineOperations(originalData,name,value)
{
    var operations = [];
    var originalValue = originalData[name];
    var i;
    if (value!==null) {
        if (originalValue===null || typeof(originalValue)==='undefined') {
            // the property doesn't currently exist, so its either a PUT or LIST_CREATE
            if (value instanceof Array) {
                // create an empty list property
                operations.push([ "LC" ]);

                if (value.length) {
                    // create a list containing values
                    for (i = 0;i < value.length; ++i) {
                        operations.push([ "LP", i, value[i] ]);
                    }
                }
            } else {
                operations.push([ "P", value ]);
            }
        } else {
            // the property exists - now we want to see if its the same or not
            if (originalValue instanceof Array && value instanceof Array) {
                // for array values we want to try and be more efficient than just replacing
                // the entire list - so we'll try to identify just the elements that were
                // removed/updated/added to the list instead using a diff algorithm
                var lcs = computeLCS(originalValue, value);
                var lcsIndex = 0;
                // anything present in the new value but not in the LCS is a new addition
                for (i = 0; i < value.length; ++i) {
                    if (lcsIndex >= lcs.length || !serializedValuesEqual(value[i],lcs[lcsIndex])) {
                        operations.push([ "LI", i, value[i] ]);
                    } else {
                        ++lcsIndex;
                    }
                }

                lcsIndex = 0;
                //anything present in the original, but not in the LCS is a removal
                for (i = 0; i < originalValue.length; ++i) {
                    if (lcsIndex >= lcs.length || !serializedValuesEqual(originalValue[i],value[i])) {
                        operations.push([ "LD", i ]);
                    } else {
                        ++lcsIndex;
                    }
                }

                // apply operations in reverse order so the indexes don't get messed up as
                // the lists content changes
                operations.sort(function(a,b) {
                    if (a[1] === b[1]) {
                        // deletes should go ahead of inserts so we
                        // don't delete entries we have just added
                        return a[0] === "LD" ? -1 : 1;
                    }
                    return a[1] - b[1];
                });
            } else {
                // if we're not dealing with arrays, then we can just compare and put in the 
                // new value if necessary
                if (!serializedValuesEqual(originalValue,value)) {
                    operations.push([ "P", value ]);
                }
            }
        }
    } else if (typeof(originalValue)!=='undefined' || originalValue !== null) {
        // the value is null but it was not previously, its a delete operation
        operations.push([ "D" ]);
    }
    return operations;
}

module.exports.prototype.update = function(update,opts)
{
    opts = opts || {};
    opts.idGetter = opts.idGetter || defaultIdGetter;

    var id = getObjectId(update, opts.idGetter, null);
    if (!id) {
        throw new Error('Object to be updated must have a non null/empty Id');
    }

    var row = this._rows[id];
    if (row) {
        if (row.state !== RowState.UNCHANGED) {
            return false;
        }
        row.state = RowState.UPDATING;

        var change = [ "U", this.id, id, {} ];

        for (var key in update) {
            if (update.hasOwnProperty(key)) {
                var value = update[key];
                value = value !== null ? serializeValue(value) : null;
                var operations = determineOperations(row.data, key, value);
                change = this._addPendingOperations(key,value,operations,change);
            }
        }

        var hasValues = false;
        for (key in change) {
            if (change.hasOwnProperty(key)) {
                hasValues = true;
                break;
            }
        }
        if (hasValues) {
            this._pendingChanges.push(change);
        }
        return true;
    }
    return false;
};

module.exports.prototype._addPendingOperations = function(name,value,operations,change) {
    var dictionary = change[change.length -1 ];

    for (var i = 0; i < operations.length; ++i) {
        if (dictionary[name]) {
            this._pendingChanges.push(change);
            var rowId = change[2];

            change = [ "U", this.id, rowId ];
            dictionary = {};
            change.push(dictionary);
        }
        dictionary[name] = operations[i];
    }
    return change;
};
