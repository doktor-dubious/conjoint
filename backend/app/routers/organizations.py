"""Organization CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Organization, User
from ..schemas import OrganizationCreate, OrganizationOut, OrganizationUpdate

router = APIRouter(prefix="/api/organizations", tags=["organizations"])


def _users(db: Session, ids: list[str] | None) -> list[User]:
    if not ids:
        return []
    return list(db.execute(select(User).where(User.id.in_(ids))).scalars())


@router.get("", response_model=list[OrganizationOut])
def list_organizations(db: Session = Depends(get_db)) -> list[Organization]:
    stmt = (
        select(Organization)
        .options(selectinload(Organization.users))
        .order_by(Organization.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=OrganizationOut, status_code=201)
def create_organization(
    payload: OrganizationCreate, db: Session = Depends(get_db),
) -> Organization:
    if not payload.name.strip():
        raise HTTPException(400, "name cannot be empty")
    org = Organization(
        name=payload.name.strip(),
        description=payload.description,
        notes=payload.notes,
        users=_users(db, payload.user_ids),
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganizationOut)
def get_organization(org_id: str, db: Session = Depends(get_db)) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "organization not found")
    return org


@router.patch("/{org_id}", response_model=OrganizationOut)
def update_organization(
    org_id: str, payload: OrganizationUpdate, db: Session = Depends(get_db),
) -> Organization:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "organization not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        org.name = name
    if payload.description is not None:
        org.description = payload.description or None
    if payload.notes is not None:
        org.notes = payload.notes or None
    if payload.user_ids is not None:
        org.users = _users(db, payload.user_ids)
    db.commit()
    db.refresh(org)
    return org


@router.delete("/{org_id}", status_code=204)
def delete_organization(org_id: str, db: Session = Depends(get_db)) -> None:
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "organization not found")
    db.delete(org)
    db.commit()
