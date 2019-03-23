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
const { ok, error } = await auth.authenticate({ username, password });
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
Works just like a normal fetch (you can pass options as second params as usual).

- Appends a valid token to request and call signout() if 401 is returned from server
- Defaults to 'GET' if no options are passed
- Appends api path if it is set in `auth.initialize`

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
[react-hooks](https://github.com/tobbbe/tauth/blob/master/examples/react-hooks.js)<br/>
[react-redux](https://github.com/tobbbe/tauth/blob/master/examples/react-redux.js)<br/>
