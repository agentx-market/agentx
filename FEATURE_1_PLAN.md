# Feature 1: Agent Registry API Implementation

## Current State Analysis
From examining server.js, I can see:
1. There's already a POST /api/agents endpoint for registration (lines 340-368)
2. There's already a GET /api/agents endpoint for listing (lines 370-388) 
3. There's already a GET /api/agents/:id endpoint for details (lines 421-431)
4. The agents table exists in db.js with the required fields (id, operator_id, name, description, capabilities, endpoint_url, pricing, status, health_check_passed_at, health_endpoint_url, created_at, updated_at, wallet_id, apiKeyHash)

## Required Changes
Based on the feature requirements, I need to:
1. Add the missing field `health_endpoint_url` to the agents table if it doesn't exist
2. Ensure all fields from the feature spec are properly handled in the API
3. Add proper validation for required fields
4. Update the database schema to support all the requested fields

## Implementation Plan
1. Update db.js to ensure the agents table has all required fields including health_endpoint_url
2. Check that the POST /api/agents endpoint properly handles all fields from the spec
3. Ensure GET /api/agents and GET /api/agents/:id return all requested fields
4. Test the complete flow with curl or similar

## Fields to Implement:
- name (required)
- description (optional)
- capabilities (required, array)
- endpoint_url (required)
- pricing (optional)
- health_endpoint_url (optional)

The existing code already appears to handle most of these, but I need to verify and potentially enhance the implementation to match the exact feature spec.