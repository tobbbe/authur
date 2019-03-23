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