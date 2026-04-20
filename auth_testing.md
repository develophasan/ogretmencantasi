# Auth-Gated App Testing Playbook

## Step 1: Create Test User & Session
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  picture: 'https://via.placeholder.com/150',
  created_at: new Date()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
- GET /api/auth/me with Authorization: Bearer <session_token>
- CRUD /api/students

## Step 3: Browser Testing
- Set `session_token` cookie with path=/, secure=true, sameSite=None, httpOnly=true
- Navigate to /dashboard

## Checklist
- User has `user_id` UUID field
- Session `user_id` matches user.user_id
- All queries project `{_id: 0}`
- /api/auth/me returns user data
- Dashboard loads without redirect

## Auth endpoints
- POST /api/auth/session - Body: { session_id } → Sets session_token cookie
- GET  /api/auth/me      - Returns user
- POST /api/auth/logout  - Clears cookie
