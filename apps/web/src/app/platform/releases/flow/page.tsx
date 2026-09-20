'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Card, Loader, PageHead, Pill, SectionHead } from '@/ui';

/**
 * How a change reaches a shop — the one page that says so.
 *
 * Hand-maintained documentation, not something generated. It is here rather
 * than in a README because the person asking "why has my fix not arrived?" is
 * usually already looking at the releases screen, and sending them to a
 * repository is sending them away.
 *
 * KEEP IT TRUE. When the real pipeline changes, edit the data below. The
 * moving parts it mirrors:
 *   .github/workflows/ota-publish.yml        the fingerprint gate
 *   .github/workflows/native-ios.yml         TestFlight and App Store
 *   .github/workflows/native-android.yml     Play internal and production
 *   .github/workflows/post-native-release.yml  baselines and the version gate
 *   apps/mobile/fastlane/Fastfile            the lanes those call
 *   deploy/environments.json                 which branch means which server
 *
 * A page that lies about the pipeline is worse than no page: it is consulted
 * precisely when somebody is confused, and it will confirm whatever it says.
 */

type Who =
  | { kind: 'person'; who: string }
  | { kind: 'robot'; what: string }
  | { kind: 'store'; who: string };

interface Step {
  title: string;
  detail: string;
  by: Who[];
}

interface Lane {
  heading: string;
  branch: string;
  tone: 'dev' | 'prod';
  steps: Step[];
}

interface Section {
  title: string;
  note: string;
  lanes: [Lane, Lane];
}

const SECTIONS: Section[] = [
  {
    title: 'The web app',
    note: 'The shortest path there is. Nothing is signed, nothing is reviewed, and nobody has to install anything.',
    lanes: [
      {
        heading: 'Staging',
        branch: 'development',
        tone: 'dev',
        steps: [
          {
            title: 'Push to development',
            detail: 'CI runs lint, typecheck and all four suites, on every branch — not just this one.',
            by: [{ kind: 'robot', what: 'ci.yml' }],
          },
          {
            title: 'Deploy',
            detail: 'Run from a working tree with the Vercel CLI, so nothing about it depends on the repository being readable.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
      {
        heading: 'Production',
        branch: 'main',
        tone: 'prod',
        steps: [
          {
            title: 'Merge development into main',
            detail: 'The same commits, now on the branch that means a shop.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
          {
            title: 'Deploy',
            detail: 'The web app has no store and no review. What is deployed is what is live.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
    ],
  },
  {
    title: 'The app, over the air',
    note: 'JavaScript only. It cannot carry a native change, and the whole gate exists to stop it trying.',
    lanes: [
      {
        heading: 'Staging',
        branch: 'development',
        tone: 'dev',
        steps: [
          {
            title: 'Push to development',
            detail: 'Only a change under apps/mobile starts this. A web-only push cannot change the bundle.',
            by: [{ kind: 'robot', what: 'ota-publish.yml' }],
          },
          {
            title: 'Fingerprint the native project',
            detail: 'Compared against apps/mobile/fingerprints/development.<platform>.fingerprint — the hash of the native side when the TestFlight build was cut.',
            by: [{ kind: 'robot', what: '@expo/fingerprint' }],
          },
          {
            title: 'If it matches: publish a draft',
            detail: 'Nobody has it yet. It appears on the Releases screen at 0%.',
            by: [{ kind: 'robot', what: 'publish-ota.ts' }],
          },
          {
            title: 'If it differs: build instead',
            detail: 'No OTA is published, and a TestFlight build is dispatched automatically. Staging heals itself.',
            by: [{ kind: 'robot', what: 'native-ios.yml / native-android.yml' }],
          },
          {
            title: 'Roll it out',
            detail: 'Walk it up the ladder on the Releases screen — 20, 40, 60, 80, 100. The share is sticky per install, so raising it only ever adds people, and Pause holds a release live while serving nobody. A release older than the one that is live cannot be published: installs will not go backwards, so it would retire the live one on paper and change nothing on any phone. Use Roll back for that.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
      {
        heading: 'Production',
        branch: 'main',
        tone: 'prod',
        steps: [
          {
            title: 'Push to main',
            detail: 'Same trigger, same path filter, different world.',
            by: [{ kind: 'robot', what: 'ota-publish.yml' }],
          },
          {
            title: 'Fingerprint against the App Store build',
            detail: 'production.<platform>.fingerprint — written when the App Store binary was uploaded, not before.',
            by: [{ kind: 'robot', what: '@expo/fingerprint' }],
          },
          {
            title: 'If it matches: publish a canary at 20%',
            detail: 'Live immediately, for one shop in five. Not a draft: a production fix that sits waiting for a human is a fix nobody has.',
            by: [{ kind: 'robot', what: 'publish-ota.ts' }],
          },
          {
            title: 'If it differs: fail the run',
            detail: 'Nothing is dispatched and the build goes red. Production has no self-healing path, and a blocked platform must not rot behind a green checkmark.',
            by: [{ kind: 'robot', what: 'ota-publish.yml' }],
          },
          {
            title: 'Promote to everyone',
            detail: 'Walk 20% up to 100% once it looks healthy — or retire it and the app falls back to what it had.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
    ],
  },
  {
    title: 'The app, through a store',
    note: 'For anything an update cannot carry: a native module, a permission, a new icon. Always started by a person.',
    lanes: [
      {
        heading: 'TestFlight and Play internal',
        branch: 'any branch',
        tone: 'dev',
        steps: [
          {
            title: 'Run the workflow',
            detail: 'track = testflight or internal. May be run from any branch, which is the point of a test track.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
          {
            title: 'Point the binary at the staging API, on the development channel',
            detail: 'The environment is staging; the channel it serves is development, and they are not the same word. Both the manifest URL and the channel are written into the native files before the archive, so they are baked in — an update can never change either.',
            by: [{ kind: 'robot', what: 'configure-ota-target.js' }],
          },
          {
            title: 'Build, sign and upload',
            detail: 'Build number is unix epoch minutes, so it always climbs without a shared counter.',
            by: [{ kind: 'robot', what: 'fastlane' }],
          },
          {
            title: 'Write the baseline and record the build',
            detail: 'The fingerprint is committed with [skip ci], which is what lets OTA resume. The gate records the build as NOT live.',
            by: [{ kind: 'robot', what: 'post-native-release.yml' }],
          },
          {
            title: 'Confirm it is live',
            detail: 'When the track is actually serving it, say so on the Releases screen. Until then nobody is offered it.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
      {
        heading: 'App Store and Play production',
        branch: 'main only',
        tone: 'prod',
        steps: [
          {
            title: 'Run the workflow from main',
            detail: 'track = appstore or production. The workflow refuses to run from any other branch — a public build carries the production channel and reaches a real shop.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
          {
            title: 'Point the binary at production',
            detail: 'Which is why a TestFlight binary cannot simply be promoted: the staging URL and the development channel are inside it, in the native files.',
            by: [{ kind: 'robot', what: 'configure-ota-target.js' }],
          },
          {
            title: 'Build, sign and upload',
            detail: 'The binary only. The listing, screenshots and privacy answers are kept by hand in the console.',
            by: [{ kind: 'robot', what: 'fastlane' }],
          },
          {
            title: 'Review',
            detail: 'Hours to days for Apple. A Play upload lands as a draft and waits for someone to roll it out.',
            by: [{ kind: 'store', who: 'Apple / Google' }],
          },
          {
            title: 'Confirm it is live',
            detail: 'The single most important manual step here. Until someone says the store is serving it, no shop is told to update — because an update prompt for a build nobody can download is a button that does nothing.',
            by: [{ kind: 'person', who: 'whoever is shipping' }],
          },
        ],
      },
    ],
  },
];

function By({ by }: { by: Who }) {
  if (by.kind === 'robot') return <Pill label={`automatic · ${by.what}`} color="var(--accent)" />;
  if (by.kind === 'store') return <Pill label={`waiting on ${by.who}`} color="var(--warning)" />;
  return <Pill label={`by hand · ${by.who}`} color="var(--surface-lit)" />;
}

export default function ReleaseFlowPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  if (loading || !user) return <Loader />;

  return (
    <div className="shell-main" style={{ margin: '0 auto' }}>
      <PageHead
        title="How a release works"
        subtitle="Every way a change reaches a shop, and who does each part"
      />

      <Card size="sm">
        <p className="t-small">
          Two branches, two worlds. <strong>development</strong> is staging, and
          the binaries that read it are TestFlight and Play internal.{' '}
          <strong>main</strong> is a shop, and the binaries that read it come
          from the App Store and Play production.
        </p>
        <p className="t-small muted" style={{ marginTop: 'var(--s-sm)' }}>
          Neither can reach the other. The channel is written into the binary,
          so a staging bundle cannot land on a shop&apos;s phone even by
          mistake — which is the whole reason it is not an environment
          variable.
        </p>
      </Card>

      {SECTIONS.map((section) => (
        <div key={section.title}>
          <SectionHead title={section.title} />
          <p className="t-small muted" style={{ marginBottom: 'var(--s-md)' }}>
            {section.note}
          </p>
          <div className="grid-2">
            {section.lanes.map((lane) => (
              <Card key={lane.heading} size="sm">
                <div className="row-between">
                  <span className="t-small bold">{lane.heading}</span>
                  <Pill
                    label={lane.branch}
                    color={lane.tone === 'prod' ? 'var(--warning)' : 'var(--surface-lit)'}
                  />
                </div>
                <ol className="stack-sm" style={{ marginTop: 'var(--s-md)', paddingLeft: 0 }}>
                  {lane.steps.map((step, index) => (
                    <li key={step.title} style={{ listStyle: 'none' }}>
                      <div className="row" style={{ gap: 'var(--s-sm)' }}>
                        <span className="t-tiny faint">{index + 1}</span>
                        <span className="t-small bold">{step.title}</span>
                      </div>
                      <p className="t-tiny muted" style={{ margin: 'var(--s-xs) 0' }}>
                        {step.detail}
                      </p>
                      <div className="wrap">
                        {step.by.map((who, at) => (
                          <By key={at} by={who} />
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
