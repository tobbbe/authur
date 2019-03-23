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
		await _setAuthData(respData);
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
	// put it at the end of the event loop
	setTimeout(async () => {
		currentAuthData = null;
		await config.persistenceClear()
		isProcessing = false;

		_authStateChange(false)
	})
}

function _authStateChange(status) {
	log("AUTH STATE CHANGE " + status)
	_onAuthStateChangeCallbacks.forEach(c => {
		c.callback(status)
	})
}

async function _setAuthData(_newAuthData) {
	if (_newAuthData === null || typeof _newAuthData !== 'object') {
		log('auth data is invalid')
		signout()
	}
	else {
		isProcessing = true;
		_newAuthData.expires_at = Date.now() + _newAuthData.expires_in * 1000;
		currentAuthData = _newAuthData;
		await config.persistenceSet(authDataStorageKey, JSON.stringify(_newAuthData))
		_completeProcessing()
	}
}

function _completeProcessing() {
	isProcessing = false;

	for (const key in getTokenQueue) {
		log('processing token req queue item')
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
			log("refresh_token invalid", currentAuthData, respData)
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
	fetch
}

export default auth;



// helpers

async function fetch(path, options) {
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
		log(`Recieved 401 from API call. ${!token ? 'Token was null.' : ''}`)
		signout()
	}

	return resp;
}

function objectToFormData(obj) {
	return Object.keys(obj)
		.map(key => encodeURIComponent(key) + '=' + encodeURIComponent(obj[key])).join('&')
}

function log(msg) {
	if (!config || config.debug) {
		console.log(msg)
	}
}
