(function (global) {
'use strict';

var IMG_A = {
	src: 'asset/5mb.jpg',
	size: 5551598
};
var IMG_B = {
	src: 'asset/300kb.jpg',
	size: 304731
};
var IMG_C = {
	src: 'asset/1mb.jpg',
	size: 1036148
};
var IMG = IMG_C;

var INDEXED_DB_QUOTA_MAX_COUNT = 500;

var INDEXED_DB_NAME = 'browser-test';
var INDEXED_DB_OBJECT_STORES = ['quota-test', 'blob-test'];

var navigator = global.navigator;


function aboutAPI(result, callback) {
	result['webkitStorageInfo (deprecated)'] = !! global['webkitStorageInfo'];
	result['storageInfo (deprecated)'] = !! global['storageInfo'];

	result['webkitPersistentStorage'] = !! navigator['webkitPersistentStorage'];
	result['webkitTemporaryStorage']  = !! navigator['webkitTemporaryStorage'];
	result['persistentStorage'] = !! navigator['persistentStorage'];
	result['temporaryStorage']  = !! navigator['temporaryStorage'];
	callback();
}

function aboutSpec(record, callback) {
	var testnum = 2;
	var counter = 0;
	var done = function () {
		++counter >= testnum && callback();
	};

	var perAPI = navigator['persistentStorage'] || navigator['webkitPersistentStorage'] || null;
	var tempAPI = navigator['temporaryStorage'] || navigator['webkitTemporaryStorage'] || null;

	var tempQuota;
	if (tempAPI) {
		tempAPI['queryUsageAndQuota'](function (used, remaining) {
			record['temporaryStorage (used)'] = used;
			record['temporaryStorage (remain)'] = remaining;
			record['temporaryStorage (total in MB)'] = ~~((used + remaining) / 1024 / 1024);
			done();
		});
	}
	else {
		// do nothing
		done();
	}

	if (perAPI && 0) { // chorme hasn't supported persistent indexed db yet
		perAPI['queryUsageAndQuota'](function (used, remaining) {
			record['persistentStorage (used)'] = used;
			record['persistentStorage (remain)'] = remaining;
			record['persistentStorage (total in MB)'] = ~~((used + remaining) / 1024 / 1024);
			done();
		});
	}
	else {
		if (global['indexedDB']) {
			doesIDBSupportBlob(function (supported) {
				record['IDB blob support'] = supported;
				checkIndexedDBQuota(function (data) {
					record['IDB storage-size'] = data.size;
					record['IDB writing throughput average'] = data.avg;
					record['IDB writing throughput max'] = data.max;
					record['IDB writing throughput min'] = data.min;
					done();
				}, supported);
			});
		}
		else {
			record['Indexed DB'] = 'not supported';
			done();
		}
	}
}

function setupIndexedDB(handler) {
	// ensure to call onupgrade needed
	var req = global.indexedDB.open(INDEXED_DB_NAME, Date.now());
	req.onerror = function (evt) {
		console.warn("DB Err", evt);
	};
	req.onsuccess = function (evt) {
		handler(evt.target.result);
	};
	req.onupgradeneeded = function (evt) {
		console.log("onupgradeneeded");
		var db = evt.target.result;
		var stores = db.objectStoreNames;
		INDEXED_DB_OBJECT_STORES.forEach(function (name) {
			! stores.contains(name) && db.createObjectStore(name);
		});
	};
}

function tearDownIndexedDB(handler) {
	global.indexedDB.deleteDatabase(INDEXED_DB_NAME);
	console.log("existing indexed-db for tests was deleted");
}

function doesIDBSupportBlob(callback) {
	var blob = new Blob(['blob object'], {type:'text/plain'});
	setupIndexedDB(function (db) {
		console.log('stores', db.objectStoreNames);
		var tr = db.transaction(['blob-test'], 'readwrite');
		var isok;
		try {
			tr.objectStore('blob-test').put(blob, 'blob');
			db.close();
			callback(true);
		}
		catch (e) {
			db.close();
			callback(false);
		}
	});
}

function checkIndexedDBQuota(callback, isBlobSupported) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", IMG.src);
	xhr.responseType = "blob";
	xhr.addEventListener("load", function () {
		if (this.status === 200) {
			console.log("Image retrieved");
			var image = this.response;
			if (isBlobSupported) {
				fillIndexedDb(image, callback);
			}
			else {
				console.log("use base64 encoded data instead of blob to store into indexed-db");
				var reader = new FileReader();
				reader.onload = function () {
					fillIndexedDb(reader.result, callback);
				};
				reader.readAsDataURL(image);
			}
		}
		else {
			console.error("Loading Error", this);
		}
	}, false);
	xhr.send();
}
function fillIndexedDb(data, callback) {
	console.log('start filling');

	setupIndexedDB(function (db) {
		_fill(db, data, function (count, durations, hasExceedeed) {
			var max, min;
			var ttl = durations.reduce(function (a, b) {
				return a + b;
			});
			var prefix = hasExceedeed ? 'more than ' : '';
			callback({
				size: prefix + ~~(count * IMG.size / 1024 / 1024) +'MB',
				avg: ~~(ttl / count) +'ms / '+ ~~(IMG.size / 1024)+ 'KB',
				max: Math.max.apply(Math, durations) +'ms',
				min: Math.min.apply(Math, durations) +'ms'
			});
		});
	});
}
function _fill(db, dat, callback, counter, durations) {
	! counter && (counter = 0);
	! durations && (durations = []);

	var process = 0, processNum = 2;
	var done = function (err) {
		if (err) {
			if (err.name == 'QuotaExceededError') {
				callback && callback(counter, durations);
			}
			else {
				console.error("Err:", err);
			}
		}
		else {
			if (++process >= processNum) {
				// it completed so successfully that we can go next
				counter++;
				durations.push(Date.now() - t);
				if (INDEXED_DB_QUOTA_MAX_COUNT > counter) {
					_fill(db, dat, callback, counter, durations);
				}
				else {
					callback && callback(counter, durations, true);
				}
			}
		}
	};

	var t = Date.now();
	var storeName = 'quota-test';
	var transaction = db.transaction(storeName, 'readwrite');
	transaction.onerror = function (evt) {
		console.log('onerror', evt);
		done(evt.target.error);
	};
	transaction.oncomplete = function (evt) {
		console.log('completed');
		done();
	};
	transaction.onabort = function (evt) {
		console.log('aborted');
		done(evt.target.error);
	};

	var store = transaction.objectStore(storeName);
	var key = 'blob'+ counter;
	var req = store.add(dat, key);

	req.addEventListener('error', function (evt) {
		console.log("RECIEVE ERROR:", evt.name, evt.message, evt);
		done(evt);
	}, false);

	req.addEventListener('success', function (evt) {
		done();
	}, false);
}


function main(callback) {
	var record = {};
	var counter = 0, testnum = 2;

	var done = function () {
		++counter >= testnum && callback(record);
	};

	tearDownIndexedDB();
	aboutAPI(record, done);
	aboutSpec(record, done);
	// tearDownIndexedDB();
}

global.query = main;

})(this.self || global);
