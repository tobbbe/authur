const authDataStorageKey = 'authurData';
let config;
let log = console.log;
let isProcessing = false;
let currentAuthData;
let _onAuthStateChangeCallbacks = [];
let _onAuthStateChangeCallbackIds = 0;
let getTokenQueue = [];

async function initialize({ origin, authPath, apiPath, persistenceGet, persistenceSet, persistenceClear, events, debug = true }) {

	if (!(persistenceGet && persistenceSet)) {
		console.warn('authur:', 'persistenceGet or persistenceSet is not set - logins will not persist after page reloads')
	}
	if (!persistenceClear) {
		console.warn('authur:', 'persistenceClear is not set - logout will not work as expected')
	}

	persistenceGet = persistenceGet || noop;
	persistenceSet = persistenceSet || noop;
	persistenceClear = persistenceClear || noop;

	isProcessing = true;

	config = { origin, authPath, apiPath, persistenceGet, persistenceSet, persistenceClear, debug };

	if (!config.debug) {
		log = () => { };
	}

	log('authur: init') // , `callbacks: ${_onAuthStateChangeCallbacks.length}`

	if (events) {
		if (events.onAuthStateChange && events.onAuthStateChange instanceof Function) {
			_onAuthStateChangeCallbacks = _onAuthStateChangeCallbacks.filter(x => x.id !== 'init-callback-onAuthStateChange')
			_onAuthStateChangeCallbacks.push({ callback: events.onAuthStateChange, id: 'init-callback-onAuthStateChange' })
		}
	}

	const authDataRaw = await persistenceGet(authDataStorageKey);

	if (authDataRaw) {
		const persistedAuthData = JSON.parse(authDataRaw);

		if (persistedAuthData && persistedAuthData.refresh_token) {
			log('authur: init completed successfully')
			currentAuthData = persistedAuthData;
			_authStateChange(true)
		}
		else {
			log('authur: init completed but token is invalid. Signing out! data from storage was:', persistedAuthData)
			signout()
		}
	}
	else {
		log('authur: could not find any persisted data')
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
		await _setAuthData(respData);
		_authStateChange(true)

		return {
			ok: true
		};
	}
	else {
		log('authur: failed login attempt')
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
	// put it at the end of the event loop
	setTimeout(async () => {
		currentAuthData = null;
		await config.persistenceClear(authDataStorageKey)
		isProcessing = false;

		_authStateChange(false)
	})
}

function _authStateChange(status) {
	log('authur: auth state changed to: ' + status)
	_onAuthStateChangeCallbacks.forEach(c => {
		c.callback(status)
	})
}

async function _setAuthData(_newAuthData) {
	if (_newAuthData === null || typeof _newAuthData !== 'object') {
		log('authur: data is invalid')
		signout()
	}
	else {
		_newAuthData.expires_at = Date.now() + _newAuthData.expires_in * 1000;
		currentAuthData = _newAuthData;
		await config.persistenceSet(authDataStorageKey, JSON.stringify(_newAuthData))
	}
}

function _completeProcessing() {
	isProcessing = false;

	for (const key in getTokenQueue) {
		log('authur: processing getToken queue item')
		getTokenQueue[key].resolve(getToken())
	}

	getTokenQueue = [];
}

async function getToken() {
	if (isProcessing) {
		return new Promise((resolve, reject) => getTokenQueue.push({ resolve, reject }))
	}

	await _refreshToken()

	if (currentAuthData) {
		return currentAuthData.access_token;
	}

	return null;
}

async function _refreshToken() {
	// get a new token 3 seconds before the old one expires
	if (currentAuthData && Date.now() > (currentAuthData.expires_at - 3000)) {
		isProcessing = true;
		log('authur: refreshing token')

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
			log('authur: token has been refreshed')
		}
		else if (resp.status === 401) {
			log('authur: server returned 401 when trying to refresh token', currentAuthData, respData)
			signout()
		}
		else {
			log('authur: server returned an error when trying to refresh token', resp, respData)
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
	fetch: _fetch,
	fetchPost: (url, data) => _fetch(url, { method: 'POST', body: JSON.stringify(data) })
}

export default auth;



// helpers

async function _fetch(path, options) {
	const token = await getToken();

	options = options || {};
	options.method = options.method || 'GET';
	options.headers = options.headers || {
		Accept: 'application/json',
		'Content-Type': 'application/json'
	}

	if (!options.headers.Authorization) {
		options.headers.Authorization = `Bearer ${token}`;
	}

	const resp = await fetch(config.origin + config.apiPath + path, options)

	if (resp.status === 401) {
		log(`authur: recieved 401 from API call. ${!token ? 'Token was null.' : ''}`)
		signout()
	}

	return resp;
}

function objectToFormData(obj) {
	return Object.keys(obj)
		.map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])).join('&')
}

function noop() { }