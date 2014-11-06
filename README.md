# BobbyTables.js

[![Build Status](https://travis-ci.org/mrsharpoblunto/BobbyTables.js.svg?branch=master)](https://travis-ci.org/mrsharpoblunto/BobbyTables.js)

BobbyTables.js is a Javascript ORM library for the Dropbox datastore API. It handles serializing and deserializing objects to and from the remote Dropbox datastore as well as handling pushing/pulling updates

## Usage

- [Inserting data](#inserting-data)
- [Using transactions](#using-transactions)
- [Saving and loading snapshots](#saving-and-loading-snapshots)
- [Detecting changes](#detecting-changes)
- [Details on object serialization](#details-on-object-serialization)
- [Advanced handling of object id's](#advanced-handling-of-object-ids)

## API

- [DatastoreManager](#datastoremanager)
    - [get](#getid-opts--callback)
    - [list](#listopts-callback)
    - [awaitListChanges](#awaitlistchangescallback)
    - [awaitDatastoreChanges](#awaitdatastorechangescallback)
    - [getOrCreate](#getorcreateid-opts-callback)
    - [create](#createkey-callback)
    - [remove](#removestorecallback)
    - [load](#loadjsoncallback)

- [Datastore](#datastore)
    - [save](#save)
    - [revert](#revert)
    - [pull](#pullcallback)
    - [awaitPull](#awaitpullcallback)
    - [push](#pushcallback)
    - [transaction](#transactionactions)
    - [getTable](#gettableid)

- [Table](#table)
    - [insert](#insertobjectopts)
    - [remove](#removeid)
    - [get](#getid-opts)
    - [getAll](#updateobject-opts)
    - [update](#updateobject-opts)

## Usage

#### Inserting data

```javascript
var BobbyTables = require('bobbytables');

var manager = new BobbyTables('token');

// NOTE: errors not handled for the sake of brevity
manager.getOrCreate('food',function(err,store) {
    // Pull in any remote changes and make sure we are up to date before 
    // trying to apply own own local changes
    store.pull(function(err,changes) {
        // now that the store is up to date we can insert some data
        var table = store.getTable('fruit');
        table.insert({ id: 'banana' });
        store.push(function(err,pushed) {
            if (pushed) {
                // the changes were pushed!
            } else {
                // the push failed - back out of the pending changes
                store.revert();
            }
        })
    });
});
```

#### Using transactions

```javascript
// every operation inside the transation will try to be pushed to Dropbox in a single
// commit. If anything fails, all changes are reverted, the latest changes are pulled,
// and the transaction will be re-applied until the commit succeeds or the number of
// retries is exceeded
store.transaction(function(store,commit) {
    var table = store.getTable('fruit');
    table.insert({ id: 'banana' });
    
    // now try and commit the transaction
    commit();
}).push({ retries: 1 },function(err,pushed) {
    if (err) {
        // something went wrong
    }
    else if (pushed) {
        // the changes were pushed to dropbox
    } else {
        // the changes could not be pushed after x retries due to conflicts
    }
});
```

#### Saving and loading snapshots

```javascript
// the local state of a datastore can be saved to a json object
var json = store.save();

// and can then be reloaded again later
datastoreManager.load(json,function(err,store) {
    if (err) {
        // something went wrong
    } else {
        // we loaded the datastore!
    }
});
```

#### Detecting changes

```javascript
function awaitChanges(store)
{
    store.awaitPull(function(err,changed) {
        if (changed) {
            // a change occurred!
            // do some processing here
        }
        // then resume waiting
        process.nextTick(function() {awaitChanges(store);});
    });
}

// waits continuously for remote changes
awaitChanges(store);
```

#### Details on object serialization

The dropbox datastore API only has support for the following datatypes so any objects that have fields with an unsupported datastype will not be able to be serialized correctly (Arrays of any of the below data types are also supported)

Dropbox datatype | Javascript datatype
-----------------|--------------------
str              | string
number           | number
int              | number
timestamp        | Date
blob             | Buffer

#### Advanced handling of object id's
While BobbyTables will automatically look for an 'id' field on your objects when inserting and updating, it is possible to have more finegrained control over exactly which fields are used as the id for record objects. This can be useful in cases where you have domain objects that you cannot/do not wish to change in order to persist them to a datastore.

The way around this is to provide an id getter function which will return the value that should be used as the id for the object.

```javascript
var table = store.getTable('fruit');
table.insert({ 'name': 'banana' },{ idGetter: function(obj) { return obj.name; } });
```

Similarly, you can provide an id setter function when deserializing/enumerating objects if the object you are dealing with does not have a public 'id' field

```javascript
var table = store.getTable('fruit');
var banana = table.get('banana',{ idGetter: function(obj,value) { obj.name = value; } });
```

# API

## DatastoreManager

This object is used for retrieving [Datastore](#datastore) objects from dropbox. To create a DatastoreManager you will need a Dropbox OAuth 2.0 bearer token (You can get this by completing an OAuth 2.0 handshake - see [https://www.dropbox.com/developers/core/docs#oa2-authorize](https://www.dropbox.com/developers/core/docs#oa2-authorize) for more details)

```javascript
var BobbyTables = require('bobbytables');

// A dropbox OAuth bearer token
var dropboxOAuthToken = 'xyzzy';

var datastoreManager = new BobbyTables(dropboxOAuthToken);
```

#### get(id, [opts,]  callback)
Retrieves a [Datastore](#datastore) with the given id, if no matching datastore could be found, then null is returned in the callback.

- opts
    - forceRefresh (true/false) If true, calling get will always fetch the latest information from dropbox rather than using any locally cached data (defaults to false)

```javascript
datastoreManager.get('iddqd',function(err,datastore) {
    if (err)GG {
        // something went wrong
    } else if (!datastore) {
        // no datastore with the specified id
    } else {
        // we found the datastore!
    }
});
```

#### list([opts,] callback)
Retrieves an array of all available [Datastores](#datastore).

- opts
    - forceRefresh (true/false) If true, calling get will always fetch the latest information from dropbox rather than using any locally cached data (defaults to false)

```javascript
datastoreManager.list(function(err,datastores) {
    if (err) {
        // something went wrong
    } else if (!datastore.length) {
        // no datastores found
    } else {
        // we get a list of datastores
    }
});
```

#### awaitListChanges(callback)
Waits for dropbox to notify whether the list of available [Datastores](#datastore) has changed. The callback will either be called back with a value of true when a change occurs, or false if no changes were detected during the request timeout interval.

```javascript
datastoreManager.awaitListChanges(function(err,changed) {
    if (err) {
        // something went wrong
    } else if (!changed) {
        // no changes detected
    } else {
        // changed detected!
    }
});
```

#### awaitDatastoreChanges(callback)
Waits for dropbox to notify whether the contents of any [Datastore](#datastore) has changed. The callback will return with an array of all [Datastore](#datastore) objects that have changed. If no changes were detected during the request timeout interval, then this array will be empty

```javascript
datastoreManager.awaitDatastoreChanges(function(err,changes) {
    if (err) {
        // something went wrong
    } else if (!changes.length) {
        // no changes detected
    } else {
        // changes detected!
    }
});
```

#### getOrCreate(id, [opts,] callback)
Retrieves a [Datastore](#datastore) with the given id or creates it if it doesn't already exist

- opts
    - forceRefresh (true/false) If true, calling get will always fetch the latest information from dropbox rather than using any locally cached data (defaults to false)

```javascript
datastoreManager.getOrCreate('iddqd',function(err,datastore) {
    if (err) {
        // something went wrong
    } else {
        // we have a datastore!
    }
});
```
 
#### create(key, callback)
Creates a [Datastore](#datastore) with a shareable ID. The key parameter is used to generate the shared ID which is returned along with the created datastore on success

```javascript
datastoreManager.create('idkfa',function(err,response) {
    if (err) {
        // something went wrong
    } else {
        console.log('created datastore with id '+response.id);
        var newStore = response.store;
    }
});
```

#### remove(store,callback)
Deletes the supplied [Datastore](#datastore) object. The success callback returns true if the store was deleted

```javascript
datastoreManager.remove(myStore,function(err,response) {
    if (err) [
        // something went wrong
    } else if (!response) {
        // could not delete the store from dropbox
    } else {
        // deleted the store!
    }
```
});

#### load(json,callback) 
Load a serialized datastore in json (as output by Datastore.save) into a [Datastore](#datastore) object

```javascript
datastoreManager.load(json,function(err,store) {
    if (err) {
        // something went wrong
    } else {
        // we loaded the datastore!
    }
});
```

## Datastore
A datastore is an object which contains a number of tables containing dropbox datastore records.

#### save()
Saves the datastore as a json object

```javascript
var json = store.save();
```

#### revert()
Reverts all pending local changes

```javascript
store.revert();
```

#### pull(callback) 
Pulls in and applys to the datastore any remote changes from dropbox

```javascript
store.pull(function(err,store) {
    if (err) {
        // something went wrong
    } else {
        // the store has been updated
    }
});
```

#### awaitPull(callback)
Wait for a remote change to occur and applies the changes if detected

```javascript
store.awaitPull(function(err,changed) {
    if (err) {
        // something went wrong
    } else if (!changed) {
        // no changes detected
    } else {
        // a change occurred
    }
});
```

#### push(callback)
Push any local changes to dropbox

```javascript
store.push(function(err,success) {
    if (err) {
        // something went wrong
    } else if (!success) {
        // a conflict occurred - we should pull changes then try pushing again
    } else {
        // changes pushed!
    }
});
```

#### transaction(actions)
Creates a transaction object for this datastore

```javascript
store.transaction(function(store,commit) {

    // ... make some changes to the datastore
    
    // now try and commit the transaction
    commit();

}).push({ retries: 1 },function(err,pushed) {
    if (err) {
        // something went wrong
    }
    else if (pushed) {
        // the changes were pushed to dropbox
    } else {
        // the changes could not be pushed after x retries due to conflicts
    }
});

```

#### getTable(id)
Gets a [Table](#table) from the datastore or creates it if it doesn't exist

```javascript
var table = store.getTable('cupcakes');
```

## Table
Represents a set of rows in a datastore. Rows can be added, updated, and removed similar to a traditional database.
NOTE: No changes made to the database are sent to dropbox until the datastore push function is called.

#### insert(object[,opts])
Insert a javascript object into the table.

- opts
    - idGetter: A function that returns the id value to be used to store the object in the table. If omitted it is assumed that there will be an 'id' field on the object.
    - idSetter: A function that sets the id property of the object (if no id is found via the idGetter). If omitted it is assumed that the id should be set on the objects 'id' field.

```javascript
var object = {
    id: 'xxxx',
    description: 'hello world'
};
if (table.insert(object)) {
    // object inserted!
} else {
    // object could not be inserted
}
```

#### remove(id)
Remove an object with the matching id from the table

```javascript
if (table.remove('xxxx')) {
    // object removed!
} else {
    //object could not be removed
}
```

#### get(id[, opts])
Get an object stored in the table with the specified id

- opts
    - idSetter: A function that sets the id property of the object to the id of the row. If omitted the objects 'id' field will be set to the id value

```javascript
var object = table.get('xxxx');
```

#### getAll([opts])
Gets an array of all objects stored in the table

- opts
    - idSetter: A function that sets the id property of the object to the id of the row. If omitted the objects 'id' field will be set to the id value

```javascript
var objects = table.getAll();
```

#### update(object[, opts])
Updates an existing object in the table. An error will occur if no object with the matching id exists in the table.

- opts
    - idGetter: A function that returns the id value to be used to store the object in the table. If omitted it is assumed that there will be an 'id' field on the object.

```javascript
var object = {
    id: 'xxxx',
    description: 'hello world'
}
table.insert(object);

object.description = 'Hello world!';
if (table.update(object)) {
    // object updated!
} else {
    // could not update object
}
```

## License

BobbyTables.js is licensed under the [MIT license](https://github.com/mrsharpoblunto/bobbytables.js/blob/master/LICENSE).
