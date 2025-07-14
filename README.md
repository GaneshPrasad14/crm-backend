# CRM Backend API

A complete REST API for a Customer Relationship Management (CRM) system built with Node.js, Express, and MySQL.

## Features

- **User Management**: Authentication, authorization, and role-based access control
- **Customer Management**: Lead and customer tracking
- **Task Management**: Task creation, assignment, and tracking
- **Deal Management**: Sales pipeline and deal tracking
- **Invoice Management**: Invoice creation and status tracking
- **Notification System**: Real-time notifications for users

## Prerequisites

- Node.js (v14 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

## Installation

1. **Clone the repository and navigate to the backend directory:**
   ```bash
   cd pro-102/project/backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the backend directory with the following variables:
   ```
   PORT=5000
   MYSQL_HOST=localhost
   MYSQL_USER=root
   MYSQL_PASSWORD=your_password
   MYSQL_DATABASE=crm_system
   MYSQL_PORT=3306
   JWT_SECRET=your_jwt_secret_key
   ```

4. **Set up the database:**
   ```bash
   npm run setup
   ```

5. **Start the server:**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## Database Setup

The setup script will:
- Create the `crm_system` database
- Create all necessary tables
- Insert a default admin user

**Default Admin Credentials:**
- Email: `admin@crm.com`
- Password: `password`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/:id` - Get customer by ID
- `POST /api/customers` - Create new customer
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Tasks
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Deals
- `GET /api/deals` - Get all deals
- `GET /api/deals/:id` - Get deal by ID
- `POST /api/deals` - Create new deal
- `PUT /api/deals/:id` - Update deal
- `DELETE /api/deals/:id` - Delete deal

### Invoices
- `GET /api/invoices` - Get all invoices
- `GET /api/invoices/:id` - Get invoice by ID
- `POST /api/invoices` - Create new invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice

### Notifications
- `GET /api/notifications` - Get user notifications
- `GET /api/notifications/:id` - Get notification by ID
- `POST /api/notifications` - Create new notification
- `PUT /api/notifications/:id/read` - Mark notification as read
- `DELETE /api/notifications/:id` - Delete notification

## Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer your_jwt_token_here
```

## User Roles

- **admin**: Full access to all features
- **sales**: Can manage customers, tasks, deals, and invoices
- **manager**: Can view all data and manage tasks

## Error Handling

The API returns appropriate HTTP status codes and error messages:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## Development

To run in development mode with auto-restart:
```bash
npm run dev
```

## Testing the API

You can test the API using tools like Postman, curl, or any HTTP client.

Example login request:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@crm.com","password":"password"}'
```

## Database Schema

The system includes the following tables:
- `users` - User accounts and authentication
- `customers` - Customer and lead information
- `tasks` - Task management
- `deals` - Sales pipeline
- `invoices` - Invoice management
- `notifications` - User notifications

All tables include proper foreign key relationships and timestamps. 