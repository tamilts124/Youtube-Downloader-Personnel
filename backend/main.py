import uvicorn
import os
import sys

# Ensure the current directory is in sys.path so 'app' can be found
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(
        "app.main:app", 
        host="0.0.0.0", 
        port=port, 
        reload=True,
        reload_dirs=["app"]
    )
