# tauth
Supersimple oauth2 helper. Works well with [umbraco-authu](https://github.com/mattbrailsford/umbraco-authu).
Can be used in a browser (localstorage) or react-native (AsyncStorage) etc by setting `persistenceGet`, `persistenceSet` and `persistenceClear`.

## Requirements
- ES6
- async/await
- fetch

## Installation
`npm install tobbbe/tauth` (not avalible on npm)

or just download and include tauth.js

## Configuration
```javascript
import auth from 'tauth';
// import auth from './path/to/tauth'; if you just downloaded the file

auth.initialize({
	origin: 'https://your-website.s1.umbraco.io',
	authPath: '/oauth/token',
	apiPath: '/umbraco/api',
	persistenceGet: key => localStorage.getItem(key),
	persistenceSet: (key, val) => localStorage.setItem(key, val),
	persistenceClear: () => localStorage.clear(),
	debug: true,
	events: {
		onAuthStateChange: status => console.log('auth status changed to:', status))
	}
})
```

## Login
```javascript
const attempt = await auth.authenticate({ username, password }); // { ok: true/false, error: 'error message if any' }
```

## Subscribe to events
You can subscribe to auth state changes anywhere:

```javascript
const unsubscribe = auth.onAuthStateChange(status => console.log('auth status changed to:', status));

// later
unsubscribe();
```

## Signout
```javascript
auth.signout(); // will trigger onAuthStateChange subscriptions
```

## Fetch helper
Will append api path if it is set in `auth.initialize`.
Will append valid token to request and call signout() if 401 is returned from server.
Works just like a normal fetch (you can pass options as second params as usual).
Defaults to 'GET' if no options are passed.

```javascript
const resp = await auth.fetch('/news/list');
const content = await resp.json();
```

## Get token
Will refresh automagiclly and queue incoming getToken()'s while refreshing.

```javascript
const token = await auth.getToken()
```



## Check if user is authenticated

```javascript
const isAuthenticated = await auth.isAuthenticated()
```

# React example
Can also be used with redux (dispatch action on onAuthStateChange)!

```javascript
import React, { useState, useEffect } from 'react';
import auth from 'tauth';


export default function App() {
	const [loading, setLoading] = useState(false);
	const [loginForm, setloginForm] = useState({ username: '', password: '', error: null });
	const [userIsAuthenticated, setUserIsAuthenticated] = useState(false);

	useEffect(() => {
		auth.initialize({
			origin: 'https://your-website.s1.umbraco.io',
			authPath: '/oauth/portal',
			apiPath: '/umbraco/api',
			persistenceGet: key => localStorage.getItem(key),
			persistenceSet: (key, val) => localStorage.setItem(key, val),
			persistenceClear: () => localStorage.clear(),
			debug: true,
			events: {
				onAuthStateChange: status => setUserIsAuthenticated(status)
			}
		})
	}, [])

	async function login() {
		if (!loginForm.username || !loginForm.password) return;
		setLoading(true)

		const attempt = await auth.authenticate(loginForm);

		if (!attempt.ok) {
			setloginForm(state => ({ error: attempt.error, username: state.username, password: '' }))
			setLoading(false)
		}
	};

	function handleInputChange(event) {
		setloginForm({ ...loginForm, [event.target.name]: event.target.value })
	}

	if (userIsAuthenticated) {
		return (
			<div>
				<p>Logged in!</p>
				<button className="logout-button" onClick={auth.signout}>Logout</button>
			</div>
		);
	}
	else {
		return (
			<div>
				<div>
					<input name="username" placeholder="e-post" onChange={handleInputChange} value={loginForm.username} disabled={loading} />
					<input name="password" placeholder="lösenord" type="password" onChange={handleInputChange} value={loginForm.password} disabled={loading} />
					<input type="button" onClick={login} value="Login" disabled={loading} />
					<p>{loginForm.error}</p>
				</div>
			</div>
		)
	}
}

```