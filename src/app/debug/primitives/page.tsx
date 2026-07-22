"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  Chip,
  CreditsPill,
  Field,
  FileDrop,
  Modal,
  Progress,
  SegmentedControl,
  Select,
  Skeleton,
  TextInput,
} from "@/components/ui";
import { Citation, ConfDot, RankedRow, VerifiedStar } from "@/components/trust";

/**
 * /debug/primitives — the D2 acceptance gate + living component gallery.
 * Every primitive in its states, so we can eyeball the whole system on
 * one page and catch drift.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-400">
        {title}
      </h2>
      <div className="rounded-ds-lg border border-ink-150 bg-white p-6 shadow-ds-xs">
        {children}
      </div>
    </section>
  );
}

export default function PrimitivesGallery() {
  const [density, setDensity] = useState<"max" | "balanced" | "essentials">("max");
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-signal-600">
          Design system · v2
        </p>
        <h1 className="mt-2 font-serif text-4xl text-ink-900">Primitives</h1>
        <p className="mt-2 text-sm text-ink-600">
          The parts every screen is built from. States shown side by side.
        </p>
      </header>

      <Group title="Buttons">
        <div className="space-y-4">
          <Row label="primary">
            <Button>Generate my sheet</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Working</Button>
          </Row>
          <Row label="signal / soft">
            <Button variant="signal">Upgrade to 3-Pack</Button>
            <Button variant="soft">Soft signal</Button>
          </Row>
          <Row label="secondary / ghost / danger">
            <Button variant="secondary">Make another</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Delete sheet</Button>
          </Row>
        </div>
      </Group>

      <Group title="Inputs">
        <div className="grid max-w-md gap-4">
          <Field label="Email">
            <TextInput type="email" placeholder="ada@university.edu" />
          </Field>
          <Field label="Course code" helper="Optional — helps the engine calibrate.">
            <TextInput placeholder="STAT 200" />
          </Field>
          <Field label="File" error="file exceeds 40 MB">
            <TextInput defaultValue="past-exam-2019.pdf" invalid />
          </Field>
          <Field label="Search">
            <TextInput
              type="search"
              placeholder="Search your sheets"
              leading={
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
              }
            />
          </Field>
          <Field label="Density">
            <Select defaultValue="max">
              <option value="max">MAX — fit everything</option>
              <option value="balanced">Balanced — high-yield</option>
              <option value="essentials">Essentials — core only</option>
            </Select>
          </Field>
        </div>
      </Group>

      <Group title="Chips & badges">
        <div className="flex flex-wrap gap-2">
          <Chip onRemove={() => {}} removeLabel="remove">
            Lecture 08.pdf
          </Chip>
          <Chip tone="exam">★ Past exam · high weight</Chip>
          <Chip tone="success">Verified</Chip>
          <Chip tone="signal">MAX density</Chip>
          <Chip tone="warn">2 credits left</Chip>
          <Chip tone="neutral">Draft</Chip>
          <Chip tone="ink">PRO</Chip>
        </div>
      </Group>

      <Group title="Segmented control & credits">
        <div className="flex flex-wrap items-center gap-6">
          <SegmentedControl
            ariaLabel="Density"
            value={density}
            onChange={setDensity}
            options={[
              { value: "max", label: "MAX" },
              { value: "balanced", label: "Balanced" },
              { value: "essentials", label: "Essentials" },
            ]}
          />
          <CreditsPill credits={2} />
          <CreditsPill credits={1} />
          <CreditsPill credits={0} planLabel="Sprint Pass" />
        </div>
      </Group>

      <Group title="Callouts">
        <div className="grid gap-3 sm:grid-cols-2">
          <Callout variant="info" title="Image-only PDF">
            &quot;lecture-scan.pdf&quot; has no selectable text. We OCR&apos;d it — accuracy may be lower.
          </Callout>
          <Callout variant="warn" title="5 topics trimmed to fit one page">
            The lowest-confidence items were cut so the sheet holds at MAX.
          </Callout>
          <Callout variant="danger" title="Generation failed">
            Your credit was refunded automatically. Try again in a moment.
          </Callout>
          <Callout variant="success" title="Fits at MAX ✓">
            All 48 ranked topics fit on one page.
          </Callout>
        </div>
      </Group>

      <Group title="Progress — the confidence meter">
        <div className="max-w-sm space-y-4">
          <Progress value={72} label="Confidence in result" rightSide="72%" />
          <p className="text-xs text-ink-500">Add a past exam to push confidence past 85%.</p>
          <Progress value={40} tone="signal" label="Drafting the sheet" rightSide="40%" />
        </div>
      </Group>

      <Group title="Trust layer — ranked rows">
        <div className="grid max-w-lg gap-2">
          <RankedRow rank={1} title="Confidence interval construction" conf="high" verified src="Lecture 08 s23 · Final '19 Q3" />
          <RankedRow rank={2} title="Choosing z vs t" conf="high" verified src="Review guide p4 · Final '21 Q2" />
          <RankedRow rank={3} title="Interpreting a p-value" conf="med" src="Lecture 11 · HW3 Q5" />
          <RankedRow rank={4} title="Sampling distribution shape" conf="low" src="Lecture 06" />
        </div>
        <p className="mt-4 text-sm text-ink-600">
          Inline trust marks: <ConfDot conf="high" size={9} /> high · <ConfDot conf="med" size={9} /> med ·{" "}
          <ConfDot conf="low" size={9} /> low · <VerifiedStar verified /> verified ·{" "}
          <Citation src="Slide 14" />
        </p>
      </Group>

      <Group title="File-drop zone">
        <FileDrop onFiles={() => {}} accept=".pdf,.txt,.md" />
      </Group>

      <Group title="Skeletons & modal">
        <div className="flex items-center gap-6">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" rounded="lg" />
          </div>
          <Button variant="secondary" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
        </div>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} labelledBy="demo-modal-title">
          <h3 id="demo-modal-title" className="font-serif text-2xl text-ink-900">
            Keep the momentum going
          </h3>
          <p className="mt-2 text-sm text-ink-600">
            You&apos;ve used your last credit. Grab a 3-Pack — three sheets, 33% cheaper, never expire.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Not now
            </Button>
            <Button variant="signal" onClick={() => setModalOpen(false)}>
              Get 3-Pack · $9.99
            </Button>
          </div>
        </Modal>
      </Group>

      <Group title="Cards">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>Standard surface</Card>
          <Card interactive>Interactive (hover me)</Card>
          <Card className="bg-ink-50">Tinted</Card>
        </div>
      </Group>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-40 shrink-0 font-mono text-[12px] text-ink-400">{label}</span>
      {children}
    </div>
  );
}
