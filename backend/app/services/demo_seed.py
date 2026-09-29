"""Synthetic mailbox for DEMO_MODE only.

This data is intentionally isolated here. Previously ``GmailService`` mixed it
into the production sync path, so a freshly connected real account appeared to
contain messages that had never been sent. ``sync_inbox`` now calls this only
when ``settings.is_demo`` is true.
"""

import time
from typing import List

from app.models.schemas import (
    ActionItem,
    AttachmentInfo,
    CategoryEnum,
    EmailItem,
    EmailSummary,
    PriorityEnum,
)

_MINUTE = 60


def build_demo_inbox(user_email: str, user_name: str) -> List[EmailItem]:
    """A small, clearly-labelled sandbox inbox."""
    now = time.time()
    user_email = user_email.lower()

    def _item(
        idx: int,
        sender_name: str,
        sender_email: str,
        subject: str,
        body: str,
        category: CategoryEnum,
        priority: PriorityEnum,
        age_seconds: int,
        *,
        is_read: bool = False,
        is_starred: bool = False,
        folder: str = "inbox",
        summary_bullets: List[str] | None = None,
        deadlines: List[str] | None = None,
        actions: List[ActionItem] | None = None,
        attachments: List[AttachmentInfo] | None = None,
        is_spam: bool = False,
    ) -> EmailItem:
        return EmailItem(
            id=f"em-usr-{idx}",
            user_email=user_email,
            sender_name=sender_name,
            sender_email=sender_email,
            recipient_email=user_email,
            subject=subject,
            snippet=body[:160].replace("\n", " "),
            body=body,
            category=category,
            priority=priority,
            date=time.strftime("%d %b, %H:%M", time.localtime(now - age_seconds)),
            timestamp=now - age_seconds,
            is_read=is_read,
            is_starred=is_starred,
            is_spam=is_spam,
            folder=folder,
            has_attachments=bool(attachments),
            attachments=attachments or [],
            spam_score=1.0 if is_spam else None,
            summary=EmailSummary(
                bullet_points=summary_bullets or [subject],
                one_liner=subject,
                deadlines=deadlines or [],
                sentiment="Urgent" if priority == PriorityEnum.HIGH else "Neutral",
            ),
            action_items=actions or [],
        )

    return [
        _item(
            10001, "Marcus Vance (CEO)", "ceo@example-corp.com",
            "URGENT: Q3 roadmap alignment and project status",
            f"Hi {user_name},\n\nI need an update on the AI email assistant before the board "
            f"meeting tomorrow morning.\n\nPlease send a progress report by 9:00 AM, and we "
            f"should sync at 4:00 PM.\n\nBest,\nMarcus",
            CategoryEnum.WORK, PriorityEnum.HIGH, 60 * _MINUTE,
            is_starred=True,
            summary_bullets=["Board meeting tomorrow morning", "Progress report due 9:00 AM"],
            deadlines=["Tomorrow 09:00", "Tomorrow 16:00"],
            actions=[
                ActionItem(task="Send progress report to the CEO", due_date="Tomorrow 09:00"),
                ActionItem(task="Attend the 4 PM exec sync", due_date="Tomorrow 16:00", is_meeting=True),
            ],
        ),
        _item(
            10002, "Sarah Jenkins (VP Engineering)", "sarah.jenkins@example-corp.com",
            "Technical architecture spec for the Q3 integration",
            f"Hi {user_name},\n\nAttached is the architecture specification for the Q3 "
            f"service integration. Please review the indexing strategy and the auth "
            f"middleware before Friday's sprint review.\n\nThanks,\nSarah",
            CategoryEnum.WORK, PriorityEnum.HIGH, 3 * 60 * _MINUTE,
            attachments=[AttachmentInfo(
                id="part-1", filename="Q3_Architecture_Spec.pdf",
                size="2.4 MB", content_type="application/pdf",
            )],
            summary_bullets=["Architecture PDF attached", "Feedback needed before sprint review"],
            deadlines=["Friday"],
            actions=[ActionItem(task="Review the architecture specification", due_date="Friday")],
        ),
        _item(
            10003, "GitHub Notifications", "notifications@github.example.com",
            "[main] Pull request #142 merged",
            "Pull request #142 'Add OAuth2 and summariser endpoint' was merged into main "
            "by sarah-jenkins. All checks passed.",
            CategoryEnum.UPDATES, PriorityEnum.LOW, 4 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10004, "Emily Zhao (Legal)", "emily.zhao@lexislegal.example.com",
            "Updated MSA and data privacy addendum for signature",
            f"Hi {user_name},\n\nOur team has finalised the updated Master Services Agreement "
            f"and Data Privacy Addendum. Please countersign by Wednesday.\n\nRegards,\nEmily",
            CategoryEnum.WORK, PriorityEnum.MEDIUM, 7 * 60 * _MINUTE,
            attachments=[AttachmentInfo(
                id="part-1", filename="MSA_Privacy_Addendum.pdf",
                size="1.8 MB", content_type="application/pdf",
            )],
            deadlines=["Wednesday"],
            actions=[ActionItem(task="Countersign the privacy addendum", due_date="Wednesday")],
        ),
        _item(
            10005, "Stripe Billing", "invoices@stripe.example.com",
            "Receipt for invoice INV-2026-9840",
            "Payment of $29.00 for your subscription was processed. "
            "Invoice INV-2026-9840. Card ending 4092.",
            CategoryEnum.FINANCE, PriorityEnum.LOW, 26 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10006, "Account Security", "no-reply@accounts.example.com",
            f"New sign-in to {user_email}",
            f"A new session was started for {user_email} from Chrome on Linux. "
            "If this wasn't you, review your account security.",
            CategoryEnum.UPDATES, PriorityEnum.MEDIUM, 5 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10007, "Amazon Shipping", "shipment-tracking@amazon.example.com",
            "Your package has been delivered",
            "Your order containing a mechanical keyboard was delivered to your front door. "
            "Carrier: UPS. Tracking 1Z999AA10482019.",
            CategoryEnum.UPDATES, PriorityEnum.LOW, 28 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10008, "TechDeals Weekly", "promos@techdeals.example.com",
            "40% off cloud infrastructure this week only",
            "Exclusive developer deal: 40% off cloud compute and managed databases. "
            "Use code DEVAI40 at checkout.",
            CategoryEnum.PROMOTIONS, PriorityEnum.LOW, 50 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10009, "IT Service Desk", "support@itdesk.example.com",
            "Scheduled maintenance this weekend",
            "The mail gateway will be unavailable from 02:00 to 04:00 UTC on Saturday "
            "for scheduled maintenance. No action is required.",
            CategoryEnum.WORK, PriorityEnum.MEDIUM, 52 * 60 * _MINUTE,
            is_read=True,
        ),
        _item(
            10010, "Account Recovery", "support@amaz0n-account-verify.example.net",
            "URGENT: Your account will be suspended - verify your password now",
            "We detected unauthorised access to your account. Your account will be "
            "permanently suspended within 2 hours unless you verify your password "
            "immediately. Click here to verify: http://amaz0n-account-verify.example.net/verify",
            CategoryEnum.SPAM, PriorityEnum.HIGH, 70 * 60 * _MINUTE,
            folder="spam", is_spam=True,
            summary_bullets=[
                "Lookalike sender domain (amaz0n with a zero)",
                "Artificial urgency with a 2-hour suspension threat",
                "Asks for password verification via an external link",
            ],
        ),
    ]
