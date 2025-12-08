# Authentication Flow Testing Guide

## Prerequisites
- Supabase local development running (`supabase start`)
- API server running on port 3001 (`pnpm --filter api dev`)

## Step 1: Create Test User via Supabase Studio

1. Open Supabase Studio: http://127.0.0.1:54323
2. Navigate to **Authentication** → **Users**
3. Click **Add user** → **Create new user**
4. Fill in:
   - Email: `test@example.com`
   - Password: `password123`
   - Auto Confirm User: ✓ (checked)
5. Click **Create user**

## Step 2: Get JWT Token

### Option A: Using curl (Recommended)

```bash
# Login to get JWT token
curl -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H 'apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Copy the `access_token` value from the response.

### Option B: Using Supabase Studio

1. In Studio, go to **Project Settings** → **API**
2. Copy the **anon/public** key
3. Use the curl command above to get the token

## Step 3: Test Endpoints

Export your token as an environment variable:

```bash
export JWT_TOKEN="<your_access_token_here>"
export API_URL="http://localhost:3001"
```

### Test 1: Unauthenticated Access (Should Fail with 401)

```bash
curl -i "${API_URL}/api/users/me"
```

**Expected**: HTTP 401 Unauthorized

### Test 2: Authenticated Access (JIT Sync)

```bash
curl -i "${API_URL}/api/users/me" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**:
- HTTP 200 OK
- User data returned with `role: "GUEST"`
- Console logs in API server showing "✅ JIT Sync: Created new user test@example.com"

### Test 3: Create Profile

```bash
curl -i -X POST "${API_URL}/api/users/me/profile" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "address": {
      "street": "123 Main St",
      "city": "Boston",
      "state": "MA",
      "postalCode": "02101",
      "country": "USA"
    },
    "phone": "+1234567890",
    "spouseName": "Jane Doe",
    "children": [
      {
        "name": "Child One",
        "age": 10
      }
    ]
  }'
```

**Expected**: HTTP 200/201 with user profile data

### Test 4: Admin Endpoint as GUEST (Should Fail with 403)

```bash
curl -i "${API_URL}/api/users" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**: HTTP 403 Forbidden (GUEST role cannot access admin endpoints)

### Test 5: Upgrade to ADMIN Role

Using Supabase Studio:

1. Go to **Table Editor** → **users** table
2. Find your test user (email: test@example.com)
3. Edit the row
4. Change `role` from `GUEST` to `ADMIN`
5. Save

### Test 6: Get New Token with ADMIN Role

```bash
# Get new token after role change
curl -X POST 'http://127.0.0.1:54321/auth/v1/token?grant_type=password' \
  -H 'apikey: sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'

# Update your JWT_TOKEN environment variable
export JWT_TOKEN="<new_access_token>"
```

### Test 7: Admin Endpoint as ADMIN (Should Succeed)

```bash
curl -i "${API_URL}/api/users" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**: HTTP 200 OK with list of all users

### Test 8: Get User by ID (Admin Only)

```bash
# Get your user ID from the /api/users/me response
export USER_ID="<your_user_id>"

curl -i "${API_URL}/api/users/${USER_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**: HTTP 200 OK with user details

### Test 9: Update User Role (Admin Only)

```bash
curl -i -X PUT "${API_URL}/api/users/${USER_ID}/role" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"role": "MEMBER"}'
```

**Expected**: HTTP 200 OK with updated user data

### Test 10: Export User Data (GDPR)

```bash
# Export your own data
curl -i "${API_URL}/api/users/me/export" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# Admin export another user's data
curl -i "${API_URL}/api/users/${USER_ID}/export" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**: HTTP 200 OK with complete user data export

### Test 11: Soft Delete Account

```bash
# Delete your own account
curl -i -X DELETE "${API_URL}/api/users/me" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected**: HTTP 200 OK with success message

After deletion, the user's `deletedAt` field will be set, and they won't be able to access the API anymore.

## Testing Summary

### What Gets Tested

✅ **Authentication**
- Unauthenticated requests are rejected (401)
- Valid JWT tokens are accepted
- JIT Sync creates users on first API access

✅ **Authorization**
- Role hierarchy works correctly (ADMIN > CONTRIBUTOR > MEMBER > GUEST)
- GUEST users cannot access admin endpoints
- ADMIN users can access all endpoints

✅ **User Management**
- Profile creation and updates
- User listing (admin only)
- Role management (admin only)

✅ **GDPR Compliance**
- Data export functionality
- Soft delete with `deletedAt` timestamp

## Troubleshooting

### "401 Unauthorized" on valid token
- Check that JWT token hasn't expired (tokens expire after 1 hour)
- Get a fresh token using the login curl command

### "403 Forbidden" on admin endpoints
- Verify user role in database (should be ADMIN)
- Get a new token after role change (old token has old role data)

### "Database error" when creating user
- Ensure Supabase is running: `supabase status`
- Reset database if needed: `supabase db reset`
- Reapply migrations: `pnpm prisma migrate deploy && pnpm prisma db seed`

### JIT Sync not creating user
- Check API server logs for errors
- Verify Supabase connection in .env file
- Ensure SupabaseService is properly configured
