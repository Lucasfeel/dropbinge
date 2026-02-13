import os

from dotenv import load_dotenv
from flask import Flask, send_from_directory
from flask_cors import CORS

import config
from database import close_db
from views.auth import auth_bp
from views.admin import admin_bp
from views.activity import activity_bp
from views.follows import follows_bp
from views.home import home_bp
from views.internal import internal_bp
from views.public_subscribe import public_subscribe_bp
from views.refresh import refresh_bp
from views.tmdb import tmdb_bp


load_dotenv()

app = Flask(__name__)
if config.CORS_ALLOW_ORIGINS:
    CORS(
        app,
        origins=config.CORS_ALLOW_ORIGINS,
        supports_credentials=config.CORS_SUPPORTS_CREDENTIALS,
    )
else:
    CORS(app)

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(tmdb_bp)
app.register_blueprint(follows_bp)
app.register_blueprint(refresh_bp)
app.register_blueprint(home_bp)
app.register_blueprint(activity_bp)
app.register_blueprint(internal_bp)
app.register_blueprint(public_subscribe_bp)


@app.teardown_appcontext
def teardown_db(exception):
    close_db(exception)


FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "frontend", "dist")


@app.route("/assets/<path:path>")
def frontend_assets(path):
    if os.path.isdir(FRONTEND_DIST):
        return send_from_directory(os.path.join(FRONTEND_DIST, "assets"), path)
    return {"error": "Frontend not built"}, 404


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def frontend_app(path):
    if os.path.isdir(FRONTEND_DIST):
        return send_from_directory(FRONTEND_DIST, "index.html")
    return {"status": "DropBinge API running", "frontend": "not built"}


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
