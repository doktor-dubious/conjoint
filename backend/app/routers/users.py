"""User CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..models import Organization, User
from ..schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users", tags=["users"])


def _orgs(db: Session, ids: list[str] | None) -> list[Organization]:
    if not ids:
        return []
    return list(
        db.execute(select(Organization).where(Organization.id.in_(ids))).scalars()
    )


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    stmt = (
        select(User)
        .options(selectinload(User.organizations))
        .order_by(User.created_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=UserOut, status_code=201)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    if not payload.name.strip():
        raise HTTPException(400, "name cannot be empty")
    user = User(
        name=payload.name.strip(),
        description=payload.description,
        notes=payload.notes,
        organizations=_orgs(db, payload.organization_ids),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: str, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "user not found")
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str, payload: UserUpdate, db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "user not found")
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "name cannot be empty")
        user.name = name
    if payload.description is not None:
        user.description = payload.description or None
    if payload.notes is not None:
        user.notes = payload.notes or None
    if payload.organization_ids is not None:
        user.organizations = _orgs(db, payload.organization_ids)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db)) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "user not found")
    db.delete(user)
    db.commit()
