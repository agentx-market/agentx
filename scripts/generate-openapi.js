const fs = require('fs');
const path = require('path');

// Read server.js to extract API routes
const serverPath = path.join(__dirname, 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Extract API endpoints with a regex approach
const apiRoutePattern = /app\.(get|post|put|delete)\(['"`]\/api(.*?)['"`],\s*[\w]+,\s*(?:async\s*)?\(?req,\s*res\s*\)(?=>{)/g;

let match;
const routes = [];

while ((match = apiRoutePattern.exec(serverContent)) !== null) {
  const method = match[1];
  const endpoint = match[2];
  
  // Get the handler function body
  const routeRegex = new RegExp(`${method}\\(['"`]\/api${endpoint}['"`],\\s*[^,]+,\\s*(?:async\\s*)?\\(?req,\\s*res\\s*\\)\\s*=>\\s*{([\\s\\S]*?)(?=app\\.\\w+\\( ['"`])`);
  const handlerMatch = serverContent.match(routeRegex);
  
  if (handlerMatch) {
    routes.push({
      method: method.toUpperCase(),
      path: `/api${endpoint}`,
      snippet: `...`,
    });
  }
}

// Generate OpenAPI spec
const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AgentX.Market Public API',
    description: 'API documentation for AgentX marketplace - discover, browse, and integrate with AI agents.',
    version: '1.0.0',
    contact: {
      name: 'AgentX Support',
      url: 'https://agentx.market/contact',
      email: 'support@agentx.market',
    },
  },
  servers: [
    {
      url: 'https://agentx.market',
      description: 'Production server',
    },
  ],
  tags: [
    { name: 'Agents', description: 'Agent discovery and management' },
    { name: 'Categories', description: 'Category listings' },
    { name: 'Search', description: 'Search endpoints' },
    { name: 'Health', description: 'Health check endpoints' },
    { name: 'Contact', description: 'Contact form submission' },
    { name: 'Waitlist', description: 'Email waitlist signup' },
    { name: 'Payments', description: 'Stripe payment links' },
    { name: 'Operator', description: 'Authenticated operator endpoints' },
  ],
  paths: {},
  components: {
    securitySchemes: {
      apiKeyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-AgentX-Key',
        description: 'Agent authentication key for API access',
      },
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Session cookie for authenticated requests',
      },
    },
    schemas: {
      Agent: {
        type: 'object',
        required: ['id', 'name', 'status'],
        properties: {
          id: { type: 'integer', example: 123 },
          name: { type: 'string', example: 'Customer Support Bot' },
          description: { type: 'string', example: 'An AI agent that handles customer inquiries' },
          capabilities: { 
            type: 'array', 
            items: { type: 'string' },
            example: ['text-generation', 'code-writing', 'email-drafting'],
          },
          endpoint_url: { type: 'string', format: 'uri', example: 'https://api.example.com/agent' },
          pricing: { type: 'string', example: '$0.01/token' },
          status: { 
            type: 'string', 
            enum: ['pending', 'active', 'suspended'],
            example: 'active',
          },
          created_at: { type: 'integer', description: 'Unix timestamp in milliseconds', example: 1709750400000 },
          updated_at: { type: 'integer', description: 'Unix timestamp in milliseconds', example: 1709750400000 },
        },
      },
      AgentDetail: {
        allOf: [{ '$ref': '#/components/schemas/Agent' }],
        properties: {
          id: { type: 'integer' },
          operator_id: { type: 'string', format: 'uuid' },
          wallet_id: { type: 'string' },
          health_check_passed_at: { 
            type: 'integer', 
            nullable: true,
            description: 'Unix timestamp when health check passed (0 if not passed)',
          },
          schema: { 
            '$ref': '#/components/schemas/APIRequestSchema',
          },
        },
      },
      APIRequestSchema: {
        type: 'object',
        properties: {
          parameters: {
            type: 'array',
            items: { '$ref': '#/components/schemas/Parameter' },
          },
          required: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      Parameter: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
          required: { type: 'boolean' },
        },
      },
      Category: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
        },
      },
      BrowseFilters: {
        type: 'object',
        properties: {
          agents: { type: 'array', items: { '$ref': '#/components/schemas/Agent' } },
          categories: { type: 'array', items: { '$ref': '#/components/schemas/Category' } },
          total_count: { type: 'integer' },
        },
      },
      ContactForm: {
        type: 'object',
        required: ['name', 'email', 'message'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          email: { type: 'string', format: 'email' },
          message: { type: 'string', minLength: 10, maxLength: 5000 },
        },
      },
      WaitlistSignup: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      PaymentLinkRequest: {
        type: 'object',
        required: ['price_id', 'customer_email'],
        properties: {
          price_id: { type: 'string', description: 'Stripe Price ID (e.g., price_abc123)' },
          customer_email: { type: 'string', format: 'email' },
          success_url: { type: 'string', format: 'uri', nullable: true },
          metadata: { 
            type: 'object', 
            additionalProperties: { type: 'string' },
            example: { order_type: 'subscription' }
          },
        },
      },
      PaymentLinkResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          url: { type: 'string', format: 'uri', description: 'Stripe Checkout URL' },
          error: { type: 'string', nullable: true },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
        },
      },
      AgentHealthStatus: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'unhealthy', 'timeout'] },
          latency_ms: { type: 'integer', nullable: true },
          status_code: { type: 'integer' },
          message: { type: 'string' },
        },
      },
      UsageSummary: {
        type: 'object',
        properties: {
          total_tasks: { type: 'integer' },
          successful_tasks: { type: 'integer' },
          failed_tasks: { type: 'integer' },
          success_rate: { type: 'number' },
          avg_completion_time_ms: { type: 'integer' },
        },
      },
    },
  },
};

// Add paths for each API endpoint based on the grep output
const paths = {
  '/api/agents': {
    get: {
      tags: ['Agents'],
      summary: 'List all agents',
      operationId: 'getAllAgents',
      responses: {
        '200': {
          description: 'Array of all public agents',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { '$ref': '#/components/schemas/Agent' },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ['Agents'],
      summary: 'Create a new agent (requires authentication)',
      operationId: 'createAgent',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                capabilities: { 
                  type: 'array',
                  items: { type: 'string' },
                },
                endpoint_url: { type: 'string', format: 'uri' },
                pricing: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Agent created successfully',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { '$ref': '#/components/schemas/Agent' },
                  {
                    type: 'object',
                    properties: {
                      message: { type: 'string' },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  '/api/agents/search': {
    get: {
      tags: ['Search'],
      summary: 'Search agents with filters',
      operationId: 'searchAgents',
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
        { name: 'categories', in: 'query', schema: { type: 'string' }, description: 'Comma-separated category IDs' },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'pending', 'suspended'] } },
      ],
      responses: {
        '200': {
          description: 'Search results',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  agents: {
                    type: 'array',
                    items: { '$ref': '#/components/schemas/Agent' },
                  },
                  total_count: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/agents/{id}': {
    get: {
      tags: ['Agents'],
      summary: 'Get agent by ID',
      operationId: 'getAgentById',
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Agent details',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/AgentDetail' },
            },
          },
        },
        '404': {
          description: 'Agent not found',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/ErrorResponse' },
            },
          },
        },
      },
    },
  },
  '/api/agents/{id}/schema': {
    get: {
      tags: ['Agents'],
      summary: 'Get API request schema for agent',
      operationId: 'getAgentSchema',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'API request schema',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/APIRequestSchema' },
            },
          },
        },
      },
    },
  },
  '/api/agents/{id}/stats': {
    get: {
      tags: ['Agents'],
      summary: 'Get agent usage statistics',
      operationId: 'getAgentStats',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Usage statistics',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/UsageSummary' },
            },
          },
        },
      },
    },
  },
  '/api/agents/{id}/invoke': {
    post: {
      tags: ['Agents'],
      summary: 'Invoke an agent (core transaction endpoint)',
      operationId: 'invokeAgent',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                task_id: { 
                  type: 'string',
                  description: 'Unique task identifier (auto-generated if omitted)',
                },
                data: {
                  type: 'object',
                  description: 'Task data to pass to the agent endpoint',
                },
                timeout_ms: {
                  type: 'integer',
                  default: 120000,
                  description: 'Timeout in milliseconds (max 600000)',
                },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Invocation successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  task_id: { type: 'string' },
                  agent_response: { type: 'object' },
                  usage: { type: 'object' },
                  cost_usd: { type: 'number' },
                  error: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/agents/{id}/health-check': {
    post: {
      tags: ['Health'],
      summary: 'Trigger health check for agent',
      operationId: 'triggerHealthCheck',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      responses: {
        '200': {
          description: 'Health check result',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/AgentHealthStatus' },
            },
          },
        },
      },
    },
  },
  '/api/browse': {
    get: {
      tags: ['Search'],
      summary: 'Browse agents with filters and sorting',
      operationId: 'browseAgents',
      parameters: [
        { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search query' },
        { 
          name: 'categories', 
          in: 'query', 
          schema: { type: 'string' }, 
          description: 'Comma-separated category IDs',
        },
        { name: 'sort', in: 'query', schema: { type: 'string', enum: ['newest', 'popular', 'top_rated'] } },
      ],
      responses: {
        '200': {
          description: 'Browse results with categories',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/BrowseFilters' },
            },
          },
        },
      },
    },
  },
  '/api/categories': {
    get: {
      tags: ['Categories'],
      summary: 'List all categories',
      operationId: 'getAllCategories',
      responses: {
        '200': {
          description: 'Array of categories',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: { '$ref': '#/components/schemas/Category' },
              },
            },
          },
        },
      },
    },
  },
  '/api/category-counts': {
    get: {
      tags: ['Categories'],
      summary: 'Get agent counts per category',
      operationId: 'getCategoryCounts',
      responses: {
        '200': {
          description: 'Agent counts by category',
          content: {
            'application/json': {
              schema: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category_id: { type: 'integer' },
                    count: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/waitlist': {
    post: {
      tags: ['Waitlist'],
      summary: 'Join the waitlist',
      operationId: 'joinWaitlist',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/WaitlistSignup' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Successfully joined waitlist',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/contact': {
    post: {
      tags: ['Contact'],
      summary: 'Submit a contact form',
      operationId: 'submitContactForm',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/ContactForm' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Message received',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },
  '/api/create-payment-link': {
    post: {
      tags: ['Payments'],
      summary: 'Create a Stripe payment link',
      operationId: 'createPaymentLink',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { '$ref': '#/components/schemas/PaymentLinkRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Payment link created',
          content: {
            'application/json': {
              schema: { '$ref': '#/components/schemas/PaymentLinkResponse' },
            },
          },
        },
      },
    },
  },
  '/api/operator': {
    get: {
      tags: ['Operator'],
      summary: 'Get authenticated operator info',
      operationId: 'getOperator',
      security: [{ sessionCookie: [] }, { apiKeyHeader: [] }],
      responses: {
        '200': {
          description: 'Operator information',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  name: { type: 'string' },
                  operator_id: { type: 'string', format: 'uuid' },
                  github_id: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  },
};

openApiSpec.paths = paths;

// Write to file
const outputPath = path.join(__dirname, 'public', 'api-docs.json');
fs.writeFileSync(outputPath, JSON.stringify(openApiSpec, null, 2));

console.log('OpenAPI spec generated successfully!');
console.log(`Output: ${outputPath}`);
console.log('Total paths defined:', Object.keys(paths).length);
