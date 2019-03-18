// install locally with `npm install ./../shared/tauth/`

const authDataStorageKey = 'tauthData';
let config;
let isInitalized = false;
let isProcessing = false;
let currentAuthData;
let _onAuthStateChangeCallbacks = [];
let _onAuthStateChangeCallbackIds = 0;
let getTokenQueue = [];


async function initialize({ origin, authPath, apiPath, persistenceGet, persistenceSet, persistenceClear, events, debug = true }) {
	if (isInitalized) {
		log('Auth service already initialized!')
		return;
	}

	isInitalized = true;
	isProcessing = true;

	config = { origin, authPath, apiPath, persistenceGet, persistenceSet, persistenceClear, debug };

	log('TokenService init start')

	if (events) {
		if (events.onAuthStateChange && events.onAuthStateChange instanceof Function) {
			onAuthStateChange(events.onAuthStateChange)
		}
	}

	const authDataRaw = await persistenceGet(authDataStorageKey);
	let success = false;

	try {
		const persistedAuthData = JSON.parse(authDataRaw);

		if (persistedAuthData && persistedAuthData.refresh_token) {
			log('token init completed successfully')
			currentAuthData = persistedAuthData;
			success = true;
			_authStateChange(success)
		}
		else {
			log('token init completed but token invalid. Signing out! oauth from storage was:', persistedAuthData)
			signout()
		}
	}
	catch (error) {
		log('error getting or parsing token. Signing out! oauth from storage was:', authDataRaw, error)
		signout()
	}

	_completeProcessing()
}

async function authenticate({ username, password }) {
	const resp = await fetch(config.origin + config.authPath, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
			Accept: 'application/json'
		},
		body: objectToFormData({
			grant_type: 'password',
			username,
			password
		})
	})

	if (resp.ok) {
		const respData = await resp.json();
		_setAuthData(respData);
		_authStateChange(true)

		return {
			ok: true
		};
	}
	else {
		log("FAILED LOGIN ATTEMPT", resp)
		return {
			ok: false,
			error: resp.status === 401 ? 'Wrong username or password' : 'Something went wrong'
		}
	}
}

function onAuthStateChange(callback) {
	const id = _onAuthStateChangeCallbackIds++;
	_onAuthStateChangeCallbacks.push({ callback, id })

	callback(isAuthenticated())

	// unsubscribe callback
	return () => {
		_onAuthStateChangeCallbacks = _onAuthStateChangeCallbacks.filter(c => c.id !== id)
	}
}

function signout() {
	currentAuthData = null;
	config.persistenceClear()
	isProcessing = false;

	_authStateChange(false)
}

function _authStateChange(status) {
	log("AUTH STATE CHANGE " + status)
	_onAuthStateChangeCallbacks.forEach(c => {
		c.callback(status)
	})
}

async function _setAuthData(_newAuthData) {
	if (_newAuthData === null || typeof _newAuthData !== 'object') throw new Error('authData must be an object');

	isProcessing = true;
	_newAuthData.expires_at = Date.now() + _newAuthData.expires_in * 1000;
	currentAuthData = _newAuthData;
	await config.persistenceSet(authDataStorageKey, JSON.stringify(_newAuthData))
	_completeProcessing()
}

function _completeProcessing() {
	isProcessing = false;

	while (getTokenQueue.length) {
		log('processing token req queue item')
		const item = getTokenQueue.shift();
		item.resolve(getToken())
	}
}

async function getToken() {
	if (isProcessing) {
		return new Promise((resolve, reject) => getTokenQueue.push({ resolve, reject }))
	}

	await _refreshToken()

	return currentAuthData && currentAuthData.access_token;
}

async function _refreshToken() {
	if (currentAuthData && Date.now() > (currentAuthData.expires_at - 10000)) {
		isProcessing = true;
		log('refreshing token')

		const resp = await fetch(config.origin + config.authPath, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
				Accept: 'application/json'
			},
			body: objectToFormData({
				grant_type: 'refresh_token',
				...currentAuthData
			}),
		});
		const respData = await resp.json();

		if (resp.ok) {
			await _setAuthData(respData)
			log('token has been refreshed')
		}
		else if (resp.status === 401) {
			console.warn("ERROR: refresh_token not valid", currentAuthData)
			log(respData)
			signout()
		}
		else {
			log('server error from refresh_token', resp, respData)
		}

		_completeProcessing()
	}
}

function isAuthenticated() {
	return !!(currentAuthData && currentAuthData.access_token);
}

const auth = {
	initialize,
	authenticate,
	signout,
	getToken,
	onAuthStateChange,
	isAuthenticated,
	get,
	cachedGet
}

export default auth;




// FETCH HELPERS //

async function get(path) {
	try {
		const token = await getToken()
		if (!token) return { ok: false, error: 'token is undefined: ' + token };

		const resp = await fetch(config.origin + config.apiPath + path, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}
		})

		if (resp.status === 401) {
			console.log('Recieved 401 from API call', resp, token)
			await signout()
		}
		else {
			const contentType = resp.headers && resp.headers.get("content-type");

			if (contentType && contentType.indexOf("application/json") !== -1) {
				const data = await resp.json();
				return { ok: true, data };
			}
			else if (contentType && contentType.indexOf("text/plain") !== -1) {
				const data = await resp.text();
				return { ok: true, data };
			}
			else {
				console.log('response couldnt be parsed', resp)
			}
		}

	} catch (error) {
		console.log(error)
	}

	return { ok: false };
}

const cache = {};
async function cachedGet(path, refresh = false) {
	if (!refresh && cache[path]) {
		return {
			data: cache[path],
			ok: true
		};
	}

	const resp = await get(path);

	if (resp.ok) {
		cache[path] = resp.data;
	}

	return resp;
}





// HELPERS //

function objectToFormData(obj) {
	return Object.keys(obj)
		.map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])).join('&')
}

function log(msg) {
	if (!config || config.debug) {
		console.log(msg)
	}
}
