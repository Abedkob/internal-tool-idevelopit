"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Columns3, MapPin, Plus } from "lucide-react";
import { ContactDrawer } from "@/components/contacts/ContactDrawer";
import { HeatChip } from "@/components/contacts/HeatChip";
import {
  getContact,
  listPipelineContacts,
  listProfiles,
  listServices,
} from "@/lib/db";
import { contactHeat } from "@/lib/heat";
import { initials, relDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactStage, Profile, Service } from "@/types/db";

const columns: { stage: ContactStage; label: string; cue: string }[] = [
  { stage: "new", label: "New", cue: "Not approached" },
  { stage: "contacted", label: "Contacted", cue: "Waiting for signal" },
  { stage: "replied", label: "Replied", cue: "Conversation open" },
  { stage: "negotiating", label: "Negotiating", cue: "Decision in motion" },
  { stage: "customer", label: "Customer", cue: "Work won" },
  { stage: "lost", label: "Lost", cue: "Closed for now" },
];
const stages = columns.map((column) => column.stage);
const stageRecord = <T,>(value: () => T): Record<ContactStage, T> => ({
  new: value(),
  contacted: value(),
  replied: value(),
  negotiating: value(),
  customer: value(),
  lost: value(),
});
const emptyRows = () => stageRecord<Contact[]>(() => []);
const emptyTotals = () => stageRecord(() => 0);
const initialLimits = () => stageRecord(() => 40);

export function PipelineClient() {
  const [grouped, setGrouped] =
    useState<Record<ContactStage, Contact[]>>(emptyRows);
  const [totals, setTotals] =
    useState<Record<ContactStage, number>>(emptyTotals);
  const [limits, setLimits] =
    useState<Record<ContactStage, number>>(initialLimits);
  const [mobileStage, setMobileStage] = useState<ContactStage>("new");
  const [mobileStageChosen, setMobileStageChosen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setFetching(true);
    setError("");
    try {
      const supabase = createClient();
      const [pipeline, profileData, serviceData] = await Promise.all([
        listPipelineContacts(supabase, limits),
        listProfiles(supabase),
        listServices(supabase),
      ]);
      setGrouped(pipeline.rows);
      setTotals(pipeline.totals);
      setProfiles(profileData);
      setServices(serviceData);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Pipeline could not be loaded.",
      );
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [limits]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (mobileStageChosen || totals[mobileStage] > 0) return;
    const firstPopulated = stages.find((stage) => totals[stage] > 0);
    if (firstPopulated) setMobileStage(firstPopulated);
  }, [mobileStage, mobileStageChosen, totals]);

  async function refreshContact(id: string) {
    setSelected(await getContact(createClient(), id));
    await load();
  }
  function keyOpen(event: React.KeyboardEvent, contact: Contact) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(contact);
    }
  }
  const activeTotal =
    totals.new + totals.contacted + totals.replied + totals.negotiating;

  if (loading)
    return (
      <div className="surface loading-state pipeline-loading">
        <span className="spinner" />
        Loading pipeline…
      </div>
    );
  return (
    <div
      className={`pipeline-view ${fetching ? "surface-fetching" : ""}`}
      aria-busy={fetching}
    >
      {error && (
        <div className="page-error" role="alert">
          {error}
          <button onClick={() => void load()}>Try again</button>
        </div>
      )}
      <div className="pipeline-summary">
        <div>
          <Columns3 size={16} />
          <span>{activeTotal} active opportunities</span>
        </div>
        <p>Each stage loads 40 cards at a time, ordered by neglect.</p>
      </div>
      <div className="pipeline-stage-tabs" aria-label="Choose pipeline stage">
        {columns.map(({ stage, label }) => (
          <button
            key={stage}
            className={mobileStage === stage ? "selected" : ""}
            onClick={() => {
              setMobileStage(stage);
              setMobileStageChosen(true);
            }}
            aria-pressed={mobileStage === stage}
          >
            {label}
            <span>{totals[stage]}</span>
          </button>
        ))}
      </div>
      <section className="pipeline-board" aria-label="Sales pipeline">
        {columns.map(({ stage, label, cue }) => (
          <div
            className={`pipeline-column pipeline-${stage} ${mobileStage === stage ? "mobile-stage-active" : ""}`}
            key={stage}
          >
            <header className="pipeline-column-header">
              <div>
                <span className="pipeline-stage-dot" />
                <h2>{label}</h2>
                <strong>
                  {grouped[stage].length}/{totals[stage]}
                </strong>
              </div>
              <p>{cue}</p>
            </header>
            <div className="pipeline-cards">
              {grouped[stage].map((contact) => (
                <article
                  className={`pipeline-card heat-edge-${contactHeat(contact)}`}
                  key={contact.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(contact)}
                  onKeyDown={(event) => keyOpen(event, contact)}
                  aria-label={`Open ${contact.name}`}
                >
                  <div className="pipeline-card-top">
                    <span className="table-avatar">
                      {initials(contact.name)}
                    </span>
                    <HeatChip contact={contact} />
                  </div>
                  <h3>{contact.name}</h3>
                  <p>{contact.notes || "No shared context yet."}</p>
                  {contact.location && (
                    <span className="pipeline-location">
                      <MapPin size={12} />
                      {contact.location}
                    </span>
                  )}
                  <footer>
                    {contact.owner ? (
                      <span className="owner-cell">
                        <span
                          className="mini-avatar"
                          style={{ backgroundColor: contact.owner.color }}
                        >
                          {initials(contact.owner.name)}
                        </span>
                        {contact.owner.name}
                      </span>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                    <span>{relDate(contact.last_touched_at)}</span>
                    <ArrowRight size={13} />
                  </footer>
                </article>
              ))}
              {!grouped[stage].length && (
                <div className="pipeline-empty">
                  <span />
                  No contacts here
                </div>
              )}
              {grouped[stage].length < totals[stage] && (
                <button
                  className="pipeline-more"
                  onClick={() =>
                    setLimits((current) => ({
                      ...current,
                      [stage]: current[stage] + 40,
                    }))
                  }
                  disabled={fetching}
                >
                  <Plus size={13} />
                  Show {Math.min(
                    40,
                    totals[stage] - grouped[stage].length,
                  )}{" "}
                  more
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      {selected && (
        <ContactDrawer
          contact={selected}
          profiles={profiles}
          services={services}
          onClose={() => setSelected(null)}
          onChanged={refreshContact}
        />
      )}
    </div>
  );
}
