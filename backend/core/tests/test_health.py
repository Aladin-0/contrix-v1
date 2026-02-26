import pytest
from django.db import connections
from django.db.utils import OperationalError

@pytest.mark.django_db
def test_database_connection():
    """Verify that the database is reachable."""
    db_conn = connections['default']
    try:
        db_conn.cursor()
    except OperationalError:
        pytest.fail("Database connection failed")
    assert True

@pytest.mark.django_db
def test_admin_page_status_code(client):
    """Verify that the admin page is reachable (returns 200 or 302)."""
    # 302 expected if redirected to login
    response = client.get('/admin/')
    assert response.status_code in [200, 302]
