const join = require('url-join');
const request = require('superagent');

function getUrl(base, method){
	return join(base, method);
}

function createAuthenticationHeaders(token){
	return { Authorization: `Bearer ${token}` };
}

function handleResponse(result){
	const { result: { success }, data } = result.body;
	if(success !== true)
		throw new Error(result.body);
	return data;
}

module.exports = function({ base_url }){
	function get(method, headers = {}){
		const url = getUrl(base_url, method);
		return request.get(url).set(headers).accept('json').then(handleResponse);
	}

	function post(method, body, headers = {}){
		const url = getUrl(base_url, method);
		return request.post(url).type('json').accept('json').set(headers).send(body).then(handleResponse);
	}

	function init(){
		return get('/auth/init');
	}

	function login(name, password){
		const body = { name, password };
		return post('/auth/login', body);
	}

	function refresh(token){
		return get('/auth/refresh', createAuthenticationHeaders(token));
	}

	function register(token, name, password){
		const body = { name, password };
		return post('/auth/register', body, createAuthenticationHeaders(token));
	}

	function change(token, name, password, newPassword){
		const body = { name, password, newPassword };
		return post('/auth/change', body, createAuthenticationHeaders(token));
	}


	return {
		init,
		login,
		register,
		refresh,
		change,
	};
};
