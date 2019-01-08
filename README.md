# @hatchapp/client
The emoji app backend consists of a rest api backend, and a socket server. The authentication to these servers are done using JWT tokens. This client gives you helper functions to create and manage valid JWT tokens and a Socket.io connections.

## Problem it solves
Emoji app socket server(game server), expects a valid JWT token, that is not expired. This JWT token is refreshed every once in a while, and may change when you call `/register`, `/change` etc. endpoints for a given user. It may be bothersome to keep track of your latest token, and to refresh and use it in socket re-connections. This module handles it for you.

## Usage
Below is an example usage, the API exposes RxJS observables.

```javascript
// require both socket and client connection handlers
const { Socket, Client } = require('@hatchapp/client');
// get a socket connection creator with the socket connection url
const { createSocket } = Socket({ url: DEFAULT_SOCKET_URL });
// get different ways of creating a jwt token
const { createAnonymous, createWithToken, createWithLogin } = Client({ backend: { base_url: DEFAULT_CLIENT_URL } });

// create an anonymous JWT token, and client/token stream with it
const { 
	// stream of tokens, emitted when token is refreshed or register/change e.g. is called
	token$, 
	// stream of clients that can be used for sending requests to the backend, emitted when token change
	client$, 
} = createAnonymous();
// with the token stream we got above, create a socket connection to a given room
// stream of socket connections, emitted each time the socket connects/reconnects
const socket$  = createSocket(token$, roomId);

// lets use the stream of client and sockets, each stream is shared, so don't hesitate subscribe more than once

// subscribe to new socket connections
const x = socket$.subscribe(
	// for each socket connection, register event handlers to the socket
	socket => registerEventHandlers(socket), 
	// socket stream stopped because of an error
	err => console.log('socket stream failed with:', err), 
	// socket stream finished, probably stopSocket is called
	() => console.log('socket stream completed')
);

// persist token for future use?
const y = token$.subscribe(token => persist(token));

// get the latest client to send a request? 
// you can login, register, change password etc. and both client/token will emit the new values.
// for example: doing this would cause infinite loop.
const z = client$.subscribe(client => client.login('yengas', 'can'));

// after three seconds, we will unsubscribe from everything
// and all the socket connection, token refresh interval etc will be closed
setTimeout(
	() => {
		x.unsubscribe();
		y.unsubscribe();
		z.unsubscribe();
	},
	3000
);
```
