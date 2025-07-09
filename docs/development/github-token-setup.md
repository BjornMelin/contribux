# GitHub Token Setup Guide

This guide explains how to generate and configure GitHub Personal Access Tokens for local development of the Contribux platform.

## 🎯 Why Do You Need a GitHub Token?

Contribux uses **two different types** of GitHub authentication:

### **OAuth Credentials** (User Authentication)

- **Purpose**: When users sign in with GitHub
- **Variables**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- **Usage**: Allows users to log into your app using their GitHub account
- **Scope**: Acts on behalf of authenticated users

### **GitHub Token** (Application API Access)

- **Purpose**: Server-side GitHub API calls that the app makes independently
- **Variable**: `GITHUB_TOKEN`
- **Usage**: App fetches repository data, searches for contribution opportunities, monitors GitHub API
- **Scope**: Acts as the application itself, not as a user

## 🔑 Generating Your GitHub Token

### **Step 1: Access GitHub Settings**

1. Navigate to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click **"Generate new token"** → **"Generate new token (classic)"**

### **Step 2: Configure Token Details**

**Token Name**: `contribux-local-dev` (or similar descriptive name)  
**Expiration**: Choose based on your security preference:

- **30 days** (recommended for high security)
- **90 days** (balanced approach)
- **No expiration** (convenient but less secure)

### **Step 3: Select Required Scopes**

Based on Contribux's codebase analysis, select these scopes:

#### **Essential Scopes (Required)**

- ✅ **`repo`** - Access repositories
  - Read repository metadata, issues, pull requests
  - Required for contribution discovery functionality
- ✅ **`read:org`** - Read organization membership
  - Access organization repositories and team structures
  - Required for finding organization-based contribution opportunities
- ✅ **`read:user`** - Read user profile information
  - Analyze contributor profiles and activity
  - Required for user matching and contribution analysis
- ✅ **`user:email`** - Read user email addresses
  - Match contributors with their contact information
  - Required for contributor identification

#### **Optional Scopes (Recommended)**

- ✅ **`read:project`** - Read GitHub Projects
  - Analyze project boards for contribution opportunities
  - Useful for project-based contribution discovery
- ✅ **`read:discussion`** - Read GitHub Discussions
  - Analyze discussions for contribution opportunities
  - Useful for community engagement analysis

### **Step 4: Generate and Secure Token**

1. Click **"Generate token"**
2. **⚠️ IMPORTANT**: Copy the token immediately - you won't be able to see it again!
3. Token format: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 🔧 Local Development Setup

### **Step 1: Add Token to Environment**

Update your `.env.local` file:

```bash
# GitHub API Token for server-side operations
GITHUB_TOKEN="ghp_your_actual_token_here"
```

### **Step 2: Verify Token Works**

Test your token using curl:

```bash
# Test the token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.github.com/user
```

Expected response should show your GitHub user information.

### **Step 3: Test Application Integration**

Run the project's connection test:

```bash
# Test database and API connections
pnpm db:test-connection
```

## 🧪 Development Workflow

### **Daily Development**

```bash
# Start development server (uses GITHUB_TOKEN for API calls)
pnpm dev

# Run tests (ensure token is working)
pnpm test

# Check API connectivity
pnpm db:test-connection
```

### **Token Usage in Codebase**

The `GITHUB_TOKEN` is used throughout the application:

- **`src/lib/di/container.ts`** - GitHub API authentication
- **`src/lib/env.ts`** - Environment validation (required, min 40 chars)
- **`src/lib/factories/service-factory.ts`** - GitHub service configuration
- **`src/lib/monitoring/github-api-benchmarks.ts`** - API performance monitoring
- **`src/lib/github/runtime-validator.ts`** - GitHub API validation
- **`src/lib/config/provider.ts`** - GitHub API configuration

## 🔒 Security Best Practices

### **Token Management**

- **Never commit** tokens to version control
- **Use environment variables** only (`.env.local`)
- **Add to `.gitignore`** (already configured)
- **Store securely** - consider using a password manager

### **Scope Minimization**

- **Only select required scopes** - avoid unnecessary permissions
- **Review regularly** - remove unused scopes
- **Principle of least privilege** - grant minimal access needed

### **Token Rotation**

For enhanced security, rotate your token monthly:

```bash
# 1. Generate new token with same scopes
# 2. Update .env.local with new token
GITHUB_TOKEN="ghp_new_token_here"

# 3. Test the new token
curl -H "Authorization: Bearer NEW_TOKEN" https://api.github.com/user

# 4. Delete old token from GitHub settings
```

## 📋 Token Scope Reference

| Scope | Why Needed | Used For |
|-------|------------|----------|
| `repo` | Repository access | Fetching repo metadata, issues, PRs for contribution discovery |
| `read:org` | Organization data | Finding organization repositories and team structures |
| `read:user` | User profiles | Analyzing contributor profiles and activity |
| `user:email` | User emails | Matching contributors with their contact information |
| `read:project` | Project boards | Analyzing GitHub Projects for contribution opportunities |
| `read:discussion` | Discussions | Analyzing GitHub Discussions for community engagement |

## 🏢 Production vs Development

### **Local Development**

- Use Personal Access Token (this guide)
- Scoped to your personal GitHub account
- Easy to set up and manage

### **Production Deployment**

- Use GitHub App installation tokens (more secure)
- Scoped to specific repositories/organizations
- Managed through GitHub Apps

## 🚨 Troubleshooting

### **Token Not Working**

```bash
# Check token format (should start with ghp_)
echo $GITHUB_TOKEN

# Test token directly
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user

# Check rate limits
curl -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/rate_limit
```

### **Permission Denied**

- Verify all required scopes are selected
- Check if token has expired
- Ensure token is correctly added to `.env.local`

### **API Rate Limits**

- Personal tokens have 5,000 requests/hour
- Monitor usage with rate limit endpoint
- Consider caching strategies for development

## 🔄 Environment File Examples

### **Development (.env.local)**

```bash
# GitHub API Token for server-side operations
GITHUB_TOKEN="ghp_your_actual_token_here"

# OAuth credentials for user authentication
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
```

### **Testing (.env.test)**

```bash
# Use test token or mock for testing
GITHUB_TOKEN="test-github-token-for-api-testing"
```

## 🆘 Getting Help

If you encounter issues:

1. **Check token permissions** - Ensure all required scopes are selected
2. **Verify token format** - Should start with `ghp_`
3. **Test token directly** - Use curl commands above
4. **Check application logs** - Look for authentication errors
5. **Regenerate token** - If issues persist, create a new token

## 📚 Additional Resources

- [GitHub Personal Access Tokens Documentation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)
- [GitHub API Rate Limiting](https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting)
- [GitHub Token Scopes](https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps)
- [Contribux Local PostgreSQL Setup](./local-postgresql-setup.md)

---

**Note**: This token setup is required for local development. The application will use this token
for GitHub API calls while OAuth credentials handle user authentication.
