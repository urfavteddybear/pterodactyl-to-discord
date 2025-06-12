# Account Binding Guide

## Overview

The bot now offers **user-friendly binding methods** that don't require you to know your Pterodactyl user ID! Here are the available options:

## 🔑 Method 1: API Key Only (Recommended)

**Slash Command:**
```
/bind method:API Key Only api_key:your_api_key_here
```

**Prefix Command:**
```
!bind your_api_key_here
```

**How it works:**
- You only need your API key
- The bot automatically detects your user ID from the API key
- Most secure and reliable method

## 📧 Method 2: Email + API Key

**Slash Command:**
```
/bind method:Email + API Key api_key:your_api_key_here identifier:your@email.com
```

**Prefix Command:**
```
!bind your_api_key_here email your@email.com
```

**How it works:**
- Provides extra verification by matching your email
- Ensures the API key belongs to the specified email address

## 👤 Method 3: Username + API Key

**Slash Command:**
```
/bind method:Username + API Key api_key:your_api_key_here identifier:your_username
```

**Prefix Command:**
```
!bind your_api_key_here username your_username
```

**How it works:**
- Provides extra verification by matching your username
- Ensures the API key belongs to the specified username

## 🔐 How to Get Your API Key

1. **Login to your Pterodactyl Panel**
2. **Click on your account** (usually top right corner)
3. **Go to "API Credentials" or "Account API"**
4. **Click "Create API Key"**
5. **Give it a description** (e.g., "Discord Bot")
6. **Copy the generated key** (starts with `ptlc_`)
7. **Use it in the bind command**

## ⚠️ Important Notes

- **API keys are sensitive!** Never share them with anyone
- Use the slash command version when possible (it's more secure with ephemeral responses)
- Your API key gives access to your servers, so keep it safe
- If you suspect your API key is compromised, delete it from the panel and create a new one

## 🎯 Recommended Workflow

1. **For most users:** Use Method 1 (API Key Only)
   ```
   /bind method:API Key Only api_key:ptlc_your_key_here
   ```

2. **If you want extra verification:** Use Method 2 or 3
   ```
   /bind method:Email + API Key api_key:ptlc_your_key_here identifier:your@email.com
   ```

3. **Verify binding worked:**
   ```
   /status
   ```

4. **Start using server commands:**
   ```
   /servers
   /create-server
   ```

## 🛠️ Troubleshooting

**"Invalid API Key" Error:**
- Make sure you copied the full API key
- Check that the API key hasn't been deleted from the panel
- Ensure you're using a CLIENT API key, not an APPLICATION API key

**"Email/Username Mismatch" Error:**
- Double-check your email/username spelling
- Make sure you're using the correct case
- Verify this matches what's shown in your panel account settings

**Need Help?**
- Use `/ping` to test if the bot is working
- Contact your server administrator if you continue having issues
