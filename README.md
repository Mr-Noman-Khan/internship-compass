# Internship Compass

Keeping track of internship applications can get messy fast. Internship Compass puts the companies you’re interested in, your progress, and upcoming deadlines in one simple dashboard.

Add an opportunity when you find it, update its status as you move through the process, and use search and filters to find it again. Your applications are stored locally in a small SQLite database, and you can export them to CSV whenever you need a copy.

## What you can do

- See your application totals, interviews, offers, and upcoming deadlines at a glance
- Track each opportunity from Saved through Applied, Assessment, Interview, Offer, or Rejected
- Save locations, links, contacts, salary details, dates, and notes
- Search and filter your list, then sort it by deadline or recent activity
- Export your applications as a CSV file
- Use the responsive dashboard on a desktop or phone

## Get started

You’ll need Python 3.10 or newer.

In PowerShell, open the project folder and run:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn app.main:app --reload
```

On macOS or Linux, run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload
```

Then visit [http://127.0.0.1:8000](http://127.0.0.1:8000). The app creates `data/internship_compass.db` the first time it starts. Your database stays on your computer and is excluded from Git.

## Run with Docker

Build and start the app from the project folder:

```bash
docker build -t internship-compass .
docker run --rm -p 8000:8000 -v "${PWD}/data:/app/data" internship-compass
```

The volume keeps your database when you remove and recreate the container. In PowerShell, `${PWD}` works in the same command.

## Run the tests

```bash
py -m pytest
```

## A few project details

- **Backend:** Python and FastAPI
- **Database:** SQLite
- **Frontend:** HTML, CSS, and vanilla JavaScript
- **API docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

The API includes endpoints for applications, dashboard statistics, CSV export, and a health check. No API keys or external services are needed.

## Project layout

```text
app/       FastAPI application and database helpers
static/    Dashboard HTML, styles, and JavaScript
tests/     API tests
data/      Local SQLite database (not committed)
```

Internship Compass is a personal tracker intended to run locally. It doesn’t scrape job sites, send emails, or include user accounts.
