# tauth
Supersimple oauth2 helper. Works well with [umbraco-authu](https://github.com/mattbrailsford/umbraco-authu).
Can be used in a browser (localstorage) or react-native (AsyncStorage) etc by setting `persistenceGet`, `persistenceSet` and `persistenceClear`.

## Requirements
- ES6
- async/await

## Installation
`npm install tobbbe/tauth` (not avalible on npm)

or just download and include tauth.js

## Configuration
```
import auth from 'tauth';
// import auth from './path/to/tauth'; if you just downloaded the file

auth.initialize({
	domain: 'https://your-website.s1.umbraco.io'
	authPath: '/oauth/token',
	apiPath: '/umbraco/api', // if you want to use auth.get() helper
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
```
import auth from "tauth";

const attempt = await auth.authenticate({ username, password });
```

## Subscribe to events
You can also subscribe to auth state changes in other places:

```
const unsubscribeFn = auth.onAuthStateChange(status => console.log('auth status changed to:', status));

```

## Signout
```
import auth from "tauth";

auth.signout(); // will trigger onAuthStateChange subscriptions
```

## Fetch helper (api GET)
Requires apiPath to be set in `auth.initialize`.
Will append valid token to request. Will call signout if token is invalid or 401 is returned from server.

```
import auth from "tauth";

const token = auth.get('/news/list')
```

## Get token
Will refresh automagiclly and queue incoming getToken()'s while refreshing.

```
import auth from "tauth";

const token = auth.getToken()
```

# React example
Can also be used with redux (dispatch action on onAuthStateChange)!

```
import React, { useState, useEffect } from 'react';
import auth from 'tauth';


export default function App() {
	const [loading, setLoading] = useState(false);
	const [loginForm, setloginForm] = useState({ username: '', password: '', error: null });
	const [userIsAuthenticated, setUserIsAuthenticated] = useState(false);

	useEffect(() => {
		auth.initialize({
			domain: 'https://your-website.s1.umbraco.io',
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