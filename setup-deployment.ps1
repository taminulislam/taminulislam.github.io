# Deployment Setup Helper Script
# Run this script to test your setup and push changes

Write-Host "🚀 Setting up automatic deployment..." -ForegroundColor Green

# Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "❌ Git repository not found. Please initialize git first:" -ForegroundColor Red
    Write-Host "   git init" -ForegroundColor Yellow
    Write-Host "   git remote add origin https://github.com/yourusername/yourrepository.git" -ForegroundColor Yellow
    exit 1
}

# Check if GitHub Actions workflow exists
if (-not (Test-Path ".github/workflows/deploy-to-cpanel.yml")) {
    Write-Host "❌ GitHub Actions workflow not found!" -ForegroundColor Red
    Write-Host "   Please ensure the workflow file is created." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Git repository found" -ForegroundColor Green
Write-Host "✅ GitHub Actions workflow found" -ForegroundColor Green

# Ask user if they want to test the deployment
$testDeployment = Read-Host "Do you want to test the deployment now? (y/n)"

if ($testDeployment -eq "y" -or $testDeployment -eq "Y") {
    Write-Host "📝 Creating a test commit..." -ForegroundColor Blue
    
    # Add all files
    git add .
    
    # Create commit
    git commit -m "Test automatic deployment setup"
    
    # Push to GitHub
    Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Blue
    git push origin main
    
    Write-Host "✅ Test deployment initiated!" -ForegroundColor Green
    Write-Host "📋 Check your GitHub repository → Actions tab to monitor the deployment" -ForegroundColor Cyan
    Write-Host "🌐 Your website should update automatically once deployment completes" -ForegroundColor Cyan
} else {
    Write-Host "📋 To test deployment manually, run:" -ForegroundColor Yellow
    Write-Host "   git add ." -ForegroundColor Cyan
    Write-Host "   git commit -m 'Your commit message'" -ForegroundColor Cyan
    Write-Host "   git push origin main" -ForegroundColor Cyan
}

Write-Host "`n📖 For detailed setup instructions, see DEPLOYMENT_SETUP.md" -ForegroundColor Magenta 