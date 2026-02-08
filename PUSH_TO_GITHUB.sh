#!/bin/bash
# Push Smart Living Advisor to GitHub

echo "🚀 Pushing Smart Living Advisor to GitHub..."
echo ""

# Check if remote exists
if git remote get-url origin &>/dev/null; then
    echo "✅ Remote 'origin' already configured"
    git remote -v
else
    echo "❌ No remote configured. Please run:"
    echo "   git remote add origin https://github.com/WaelAbouceo/smarthome-advisor.git"
    exit 1
fi

echo ""
echo "📤 Pushing to GitHub..."
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Successfully pushed to GitHub!"
    echo "🌐 View your repository at: https://github.com/WaelAbouceo/smarthome-advisor"
else
    echo ""
    echo "❌ Push failed. Make sure:"
    echo "   1. Repository exists on GitHub: https://github.com/WaelAbouceo/smarthome-advisor"
    echo "   2. You have push access"
    echo "   3. You're authenticated (check: gh auth status)"
fi
