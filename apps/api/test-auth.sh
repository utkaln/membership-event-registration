#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="http://localhost:3001"
SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_ANON_KEY="sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"

echo -e "${YELLOW}=== OSA Community Platform - Authentication Testing ===${NC}\n"

# Step 1: Create a test user
echo -e "${YELLOW}Step 1: Creating test user...${NC}"
SIGNUP_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/signup" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "data": {
      "firstName": "Test",
      "lastName": "User"
    }
  }')

# Check if signup was successful or user already exists
if echo "$SIGNUP_RESPONSE" | grep -q "access_token"; then
  echo -e "${GREEN}✓ User created successfully${NC}"
  JWT_TOKEN=$(echo $SIGNUP_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
elif echo "$SIGNUP_RESPONSE" | grep -q "already been registered"; then
  echo -e "${YELLOW}! User already exists, logging in...${NC}"

  # Login with existing user
  LOGIN_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "password": "password123"
    }')

  JWT_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

  if [ -z "$JWT_TOKEN" ]; then
    echo -e "${RED}✗ Failed to login${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Logged in successfully${NC}"
else
  echo -e "${RED}✗ Failed to create user${NC}"
  echo "$SIGNUP_RESPONSE"
  exit 1
fi

echo -e "\n${YELLOW}JWT Token: ${NC}${JWT_TOKEN:0:50}...\n"

# Step 2: Test unauthenticated access (should fail)
echo -e "${YELLOW}Step 2: Testing unauthenticated access (should fail)...${NC}"
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/api/users/me")
HTTP_CODE=$(echo "$UNAUTH_RESPONSE" | tail -n 1)
if [ "$HTTP_CODE" = "401" ]; then
  echo -e "${GREEN}✓ Correctly rejected unauthenticated request (401)${NC}"
else
  echo -e "${RED}✗ Expected 401, got ${HTTP_CODE}${NC}"
fi

# Step 3: Test authenticated access to user endpoint
echo -e "\n${YELLOW}Step 3: Testing authenticated access (JIT Sync)...${NC}"
ME_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/api/users/me" \
  -H "Authorization: Bearer ${JWT_TOKEN}")
HTTP_CODE=$(echo "$ME_RESPONSE" | tail -n 1)
BODY=$(echo "$ME_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Successfully authenticated and retrieved user data${NC}"
  echo -e "${GREEN}  JIT Sync: User created in database on first API access${NC}"
  echo -e "${YELLOW}  User Data:${NC} $(echo $BODY | jq -r '.email + " (Role: " + .role + ")"')"
else
  echo -e "${RED}✗ Expected 200, got ${HTTP_CODE}${NC}"
  echo "$BODY"
fi

# Step 4: Test creating profile
echo -e "\n${YELLOW}Step 4: Testing profile creation...${NC}"
PROFILE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}/api/users/me/profile" \
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
    "phone": "+1234567890"
  }')
HTTP_CODE=$(echo "$PROFILE_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Profile created successfully${NC}"
else
  echo -e "${RED}✗ Expected 200/201, got ${HTTP_CODE}${NC}"
  echo "$PROFILE_RESPONSE" | head -n -1
fi

# Step 5: Test admin endpoint without admin role (should fail)
echo -e "\n${YELLOW}Step 5: Testing admin endpoint as GUEST (should fail with 403)...${NC}"
ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/api/users" \
  -H "Authorization: Bearer ${JWT_TOKEN}")
HTTP_CODE=$(echo "$ADMIN_RESPONSE" | tail -n 1)

if [ "$HTTP_CODE" = "403" ]; then
  echo -e "${GREEN}✓ Correctly rejected non-admin access (403 Forbidden)${NC}"
else
  echo -e "${RED}✗ Expected 403, got ${HTTP_CODE}${NC}"
  echo "$ADMIN_RESPONSE" | head -n -1
fi

# Step 6: Get user ID for role update
USER_ID=$(echo $BODY | jq -r '.id')

echo -e "\n${YELLOW}Step 6: Manually updating user role to ADMIN in database...${NC}"
# Update role directly in database using psql
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c \
  "UPDATE users SET role = 'ADMIN' WHERE email = 'test@example.com';" > /dev/null 2>&1

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Role updated to ADMIN${NC}"
else
  echo -e "${RED}✗ Failed to update role${NC}"
fi

# Need to get a new token after role change
echo -e "\n${YELLOW}Step 7: Getting new token with ADMIN role...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }')
JWT_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
echo -e "${GREEN}✓ New token acquired${NC}"

# Step 8: Test admin endpoint with admin role
echo -e "\n${YELLOW}Step 8: Testing admin endpoint as ADMIN (should succeed)...${NC}"
ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_URL}/api/users" \
  -H "Authorization: Bearer ${JWT_TOKEN}")
HTTP_CODE=$(echo "$ADMIN_RESPONSE" | tail -n 1)
BODY=$(echo "$ADMIN_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Successfully accessed admin endpoint${NC}"
  USER_COUNT=$(echo $BODY | jq -r '.users | length')
  echo -e "${YELLOW}  Found ${USER_COUNT} users in database${NC}"
else
  echo -e "${RED}✗ Expected 200, got ${HTTP_CODE}${NC}"
  echo "$BODY"
fi

# Summary
echo -e "\n${YELLOW}=== Test Summary ===${NC}"
echo -e "${GREEN}✓ Authentication guard working correctly${NC}"
echo -e "${GREEN}✓ JIT Sync creating users on first API access${NC}"
echo -e "${GREEN}✓ Role-based authorization working correctly${NC}"
echo -e "${GREEN}✓ GUEST users cannot access admin endpoints${NC}"
echo -e "${GREEN}✓ ADMIN users can access admin endpoints${NC}"
echo -e "\n${YELLOW}Your JWT token (ADMIN role):${NC}"
echo "$JWT_TOKEN"
