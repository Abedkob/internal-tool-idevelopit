"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Check,
  ExternalLink,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  addActivity,
  addPayment,
  getContactPaymentSummary,
  listContactActivities,
  listContactPayments,
  moveContact,
  updateContact,
} from "@/lib/db";
import { createClient } from "@/lib/supabase/client";
import { fmtDay, initials, money } from "@/lib/format";
import { HeatChip } from "@/components/HeatChip";
import type {
  ActivityChannel,
  Activity,
  Contact,
  ContactStage,
  ContactUpdate,
  Cursor,
  Payment,
  PaymentStatus,
  Profile,
  Service,
} from "@/types/db";
import { useDialogFocus } from "@/lib/useDialogFocus";

const stages: ContactStage[] = [
  "new",
  "contacted",
  "replied",
  "negotiating",
  "customer",
  "lost",
];
const channels: { value: ActivityChannel; label: string }[] = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "email", label: "Email" },
  { value: "call", label: "Call" },
  { value: "in_person", label: "In person" },
  { value: "other", label: "Other" },
];

function instagramHref(value: string | null) {
  const handle = value?.trim().replace(/^@/, "");
  return handle && /^[a-zA-Z0-9._]+$/.test(handle)
    ? `https://instagram.com/${encodeURIComponent(handle)}`
    : null;
}
function whatsappHref(value: string | null) {
  if (!value || !/^[+\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? `https://wa.me/${digits}` : null;
}
function emailHref(value: string | null) {
  const email = value?.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? `mailto:${encodeURIComponent(email)}`
    : null;
}

export function ContactDrawer({
  contact,
  profiles,
  services,
  onClose,
  onChanged,
}: {
  contact: Contact;
  profiles: Profile[];
  services: Service[];
  onClose: () => void;
  onChanged: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ContactUpdate>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [channel, setChannel] = useState<ActivityChannel>("whatsapp");
  const [activityNote, setActivityNote] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [amount, setAmount] = useState(
    services[0]?.default_price?.toString() ?? "",
  );
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("pending");
  const [customDescription, setCustomDescription] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [activityCursor, setActivityCursor] = useState<Cursor | null>(null);
  const [paymentCursor, setPaymentCursor] = useState<Cursor | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState({
    collected: 0,
    pending: 0,
    entries: 0,
  });

  const loadFeeds = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const supabase = createClient();
      const [activityPage, paymentPage, summary] = await Promise.all([
        listContactActivities(supabase, contact.id),
        listContactPayments(supabase, contact.id),
        getContactPaymentSummary(supabase, contact.id),
      ]);
      setActivities(activityPage.rows);
      setActivityCursor(activityPage.nextCursor);
      setPayments(paymentPage.rows);
      setPaymentCursor(paymentPage.nextCursor);
      setPaymentSummary(summary);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Contact history could not be loaded.",
      );
    } finally {
      setLoadingFeed(false);
    }
  }, [contact.id]);

  useEffect(() => {
    setDraft({
      name: contact.name,
      instagram: contact.instagram,
      whatsapp: contact.whatsapp,
      email: contact.email,
      location: contact.location,
      billing_name: contact.billing_name,
      billing_contact: contact.billing_contact,
      billing_address: contact.billing_address,
      assigned_to: contact.assigned_to,
      notes: contact.notes,
    });
  }, [contact]);
  useEffect(() => {
    void loadFeeds();
  }, [loadFeeds]);
  const dialogRef = useDialogFocus<HTMLElement>(onClose);

  const links = useMemo(
    () => ({
      instagram: instagramHref(contact.instagram),
      whatsapp: whatsappHref(contact.whatsapp),
      email: emailHref(contact.email),
    }),
    [contact],
  );
  function set<K extends keyof ContactUpdate>(key: K, value: ContactUpdate[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await action();
      await onChanged(contact.id);
      await loadFeeds();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Changes could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function loadMoreActivities() {
    if (!activityCursor) return;
    setLoadingMore(true);
    try {
      const next = await listContactActivities(
        createClient(),
        contact.id,
        activityCursor,
      );
      setActivities((current) => [...current, ...next.rows]);
      setActivityCursor(next.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "More activity could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }
  async function loadMorePayments() {
    if (!paymentCursor) return;
    setLoadingMore(true);
    try {
      const next = await listContactPayments(
        createClient(),
        contact.id,
        paymentCursor,
      );
      setPayments((current) => [...current, ...next.rows]);
      setPaymentCursor(next.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "More payments could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }
  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    await run(() =>
      updateContact(createClient(), contact.id, {
        ...draft,
        name: draft.name?.trim(),
        instagram: draft.instagram?.trim() || null,
        whatsapp: draft.whatsapp?.trim() || null,
        email: draft.email?.trim() || null,
        location: draft.location?.trim() || null,
        billing_name: draft.billing_name?.trim() || null,
        billing_contact: draft.billing_contact?.trim() || null,
        billing_address: draft.billing_address?.trim() || null,
        notes: draft.notes?.trim() || null,
      }),
    );
  }
  async function changeStage(stage: ContactStage) {
    if (stage === contact.stage) return;
    await run(() => moveContact(createClient(), contact, stage));
  }
  async function logActivity(event: FormEvent) {
    event.preventDefault();
    if (!activityNote.trim()) return;
    await run(async () => {
      await addActivity(
        createClient(),
        contact.id,
        channel,
        activityNote.trim(),
      );
      setActivityNote("");
    });
  }
  function chooseService(id: string) {
    setServiceId(id);
    const service = services.find((item) => item.id === id);
    if (service) setAmount(String(service.default_price));
  }
  async function logPayment(event: FormEvent) {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Enter a valid payment amount.");
      return;
    }
    await run(async () => {
      await addPayment(createClient(), {
        contact_id: contact.id,
        service_id: serviceId || null,
        custom_description: serviceId ? null : customDescription.trim() || null,
        amount: numericAmount,
        status: paymentStatus,
        paid_on:
          paymentStatus === "paid"
            ? new Date().toISOString().slice(0, 10)
            : null,
      });
      setCustomDescription("");
    });
  }

  return (
    <div
      className="drawer-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        ref={dialogRef}
        className="contact-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-title"
      >
        <header className="drawer-header">
          <div className="contact-title-row">
            <span className="contact-avatar">{initials(contact.name)}</span>
            <div>
              <div className="drawer-kicker">
                <HeatChip contact={contact} compact /> Contact record
              </div>
              <h2 id="contact-title">{contact.name}</h2>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close contact"
          >
            <X size={20} />
          </button>
        </header>

        <div className="drawer-body">
          <section className="drawer-section compact-section">
            <div className="contact-actions">
              {links.whatsapp ? (
                <a
                  className="contact-action"
                  href={links.whatsapp}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle size={15} />
                  WhatsApp
                  <ExternalLink size={12} />
                </a>
              ) : null}
              {links.instagram ? (
                <a
                  className="contact-action"
                  href={links.instagram}
                  target="_blank"
                  rel="noreferrer"
                >
                  <AtSign size={15} />
                  Instagram
                  <ExternalLink size={12} />
                </a>
              ) : null}
              {links.email ? (
                <a className="contact-action" href={links.email}>
                  <Mail size={15} />
                  Email
                </a>
              ) : null}
              {!links.whatsapp && !links.instagram && !links.email && (
                <p className="empty-inline">
                  Add a valid contact channel below.
                </p>
              )}
            </div>
            <div className="stage-strip" aria-label="Contact stage">
              {stages.map((stage) => (
                <button
                  key={stage}
                  className={`stage-step ${stage === contact.stage ? "selected" : ""}`}
                  onClick={() => changeStage(stage)}
                  disabled={saving}
                >
                  <span />
                  {stage}
                </button>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Contact details</p>
                <h3>Edit the essentials</h3>
              </div>
            </div>
            <form onSubmit={saveDetails}>
              <div className="form-grid">
                <label className="field span-2">
                  <span>Name</span>
                  <input
                    value={draft.name ?? ""}
                    onChange={(event) => set("name", event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Owner</span>
                  <select
                    value={draft.assigned_to ?? ""}
                    onChange={(event) =>
                      set("assigned_to", event.target.value || null)
                    }
                  >
                    <option value="">Unassigned</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Location</span>
                  <div className="input-icon">
                    <MapPin size={14} />
                    <input
                      value={draft.location ?? ""}
                      onChange={(event) => set("location", event.target.value)}
                      placeholder="City or area"
                    />
                  </div>
                </label>
                <label className="field">
                  <span>Instagram</span>
                  <div className="input-icon">
                    <AtSign size={14} />
                    <input
                      value={draft.instagram ?? ""}
                      onChange={(event) => set("instagram", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field">
                  <span>WhatsApp</span>
                  <div className="input-icon">
                    <Phone size={14} />
                    <input
                      value={draft.whatsapp ?? ""}
                      onChange={(event) => set("whatsapp", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field span-2">
                  <span>Email</span>
                  <div className="input-icon">
                    <Mail size={14} />
                    <input
                      type="email"
                      value={draft.email ?? ""}
                      onChange={(event) => set("email", event.target.value)}
                    />
                  </div>
                </label>
                <label className="field span-2">
                  <span>Billing name</span>
                  <input value={draft.billing_name ?? ""} onChange={(event) => set("billing_name", event.target.value)} placeholder="Defaults to the contact name" />
                </label>
                <label className="field">
                  <span>Billing contact</span>
                  <input value={draft.billing_contact ?? ""} onChange={(event) => set("billing_contact", event.target.value)} />
                </label>
                <label className="field">
                  <span>Billing address</span>
                  <input value={draft.billing_address ?? ""} onChange={(event) => set("billing_address", event.target.value)} />
                </label>
                <label className="field span-2">
                  <span>Notes</span>
                  <textarea
                    rows={4}
                    value={draft.notes ?? ""}
                    onChange={(event) => set("notes", event.target.value)}
                    placeholder="Shared context, preferences, and next steps"
                  />
                </label>
              </div>
              <div className="section-actions">
                <button className="button button-secondary" disabled={saving}>
                  <Check size={15} />
                  Save details
                </button>
              </div>
            </form>
          </section>

          {contact.stage === "customer" && (
            <section className="drawer-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Commercial</p>
                  <h3>Payments</h3>
                </div>
                <span className="section-total">
                  {money(paymentSummary.collected)} collected
                </span>
              </div>
              <div className="payment-list">
                {payments.length ? (
                  payments.map((payment) => (
                    <div className="payment-row" key={payment.id}>
                      <div>
                        <strong>
                          {payment.service?.name ??
                            payment.custom_description ??
                            "Custom service"}
                        </strong>
                        <small>
                          {fmtDay(payment.paid_on ?? payment.created_at)}
                        </small>
                      </div>
                      <div>
                        <strong>{money(payment.amount)}</strong>
                        <span
                          className={`status-pill status-${payment.status}`}
                        >
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="empty-inline">No payments logged yet.</p>
                )}
              </div>
              {paymentCursor && (
                <button
                  className="load-more"
                  onClick={loadMorePayments}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <LoaderCircle size={14} className="spin-icon" />
                  ) : (
                    <Plus size={14} />
                  )}{" "}
                  Load more payments
                </button>
              )}
              <form className="inline-form payment-form" onSubmit={logPayment}>
                <label className="field">
                  <span>Service</span>
                  <select
                    value={serviceId}
                    onChange={(event) => chooseService(event.target.value)}
                  >
                    <option value="">Custom</option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!serviceId && (
                  <label className="field">
                    <span>Description</span>
                    <input
                      value={customDescription}
                      onChange={(event) =>
                        setCustomDescription(event.target.value)
                      }
                      required
                    />
                  </label>
                )}
                <label className="field">
                  <span>Amount</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select
                    value={paymentStatus}
                    onChange={(event) =>
                      setPaymentStatus(event.target.value as PaymentStatus)
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <button className="button button-secondary" disabled={saving}>
                  <Plus size={15} />
                  Add
                </button>
              </form>
            </section>
          )}

          <section className="drawer-section activity-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Relationship timeline</p>
                <h3>Activity</h3>
              </div>
              <span className="section-total">
                {activities.length}
                {activityCursor ? "+" : ""} entries loaded
              </span>
            </div>
            <form className="activity-composer" onSubmit={logActivity}>
              <select
                aria-label="Touchpoint channel"
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as ActivityChannel)
                }
              >
                {channels.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <textarea
                aria-label="Touchpoint note"
                value={activityNote}
                onChange={(event) => setActivityNote(event.target.value)}
                placeholder="What happened? What is the next move?"
                rows={3}
                required
              />
              <button
                className="button button-primary"
                disabled={saving || !activityNote.trim()}
              >
                Log touchpoint
              </button>
            </form>
            <div className="timeline">
              {loadingFeed ? (
                <div className="feed-loading">
                  <LoaderCircle size={16} className="spin-icon" />
                  Loading history…
                </div>
              ) : activities.length ? (
                activities.map((activity) => (
                  <article className="timeline-item" key={activity.id}>
                    <span
                      className={`timeline-node channel-${activity.channel ?? "other"}`}
                    />
                    <div className="timeline-content">
                      <div>
                        <span className="channel-label">
                          {activity.channel?.replace("_", " ") ?? "update"}
                        </span>
                        <time>{fmtDay(activity.created_at)}</time>
                      </div>
                      <p>{activity.note}</p>
                      <small>
                        {activity.author_profile?.name ?? "Team member"}
                      </small>
                    </div>
                  </article>
                ))
              ) : (
                <p className="empty-inline">
                  No activity yet. Log the first touchpoint above.
                </p>
              )}
            </div>
            {activityCursor && (
              <button
                className="load-more"
                onClick={loadMoreActivities}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <LoaderCircle size={14} className="spin-icon" />
                ) : (
                  <Plus size={14} />
                )}{" "}
                Load more activity
              </button>
            )}
          </section>
          {error && (
            <div className="drawer-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
