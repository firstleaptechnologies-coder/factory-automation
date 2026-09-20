import type { ManualAction, ManualModule, ProductManual } from './product-manual';

/**
 * The manual as one HTML file somebody can keep.
 *
 * Standalone on purpose: no stylesheet to fetch, no fonts, no script. A vendor
 * is handed this and it has to open in five years on a laptop in a workshop
 * with no internet, and print from there. Everything it needs is inside it.
 *
 * It is also what the owner sees on screen, rendered from the same function —
 * so the copy a vendor receives cannot look different from the copy the person
 * sending it was reading.
 */

const escape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const slug = (value: string): string => value.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();

function actionHtml(action: ManualAction): string {
  const fields = action.fields.length
    ? `<table>
        <thead><tr><th>Field</th><th>What it is</th><th>What it is for</th></tr></thead>
        <tbody>
          ${action.fields
            .map(
              (field) => `<tr>
                <td><code>${escape(field.name)}</code>${
                  field.required ? ' <span class="req">required</span>' : ''
                }</td>
                <td>${escape(field.type)}${
                  field.constraints.length
                    ? `<div class="rule">${escape(field.constraints.join(', '))}</div>`
                    : ''
                }</td>
                <td>${
                  field.definition
                    ? escape(field.definition)
                    : '<span class="todo">Not yet written up.</span>'
                }</td>
              </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    : '<p class="none">Takes nothing — it only reads.</p>';

  return `<section class="action">
    <h4><code>${escape(action.method)} ${escape(action.path)}</code></h4>
    ${action.summary ? `<p>${escape(action.summary)}</p>` : ''}
    ${
      action.permissions.length
        ? `<p class="perm">Needs: ${action.permissions.map(escape).join('; ')}</p>`
        : ''
    }
    ${fields}
  </section>`;
}

function moduleHtml(module: ManualModule): string {
  const screens = module.screens.length
    ? `<h3>Screens</h3>
       <ul class="screens">
         ${module.screens
           .map(
             (screen) =>
               `<li><strong>${escape(screen.label)}</strong>${
                 screen.blurb ? ` — ${escape(screen.blurb)}` : ''
               }<div class="where">${[
                 screen.web ? `web ${escape(screen.web)}` : '',
                 screen.app ? `app ${escape(screen.app)}` : '',
               ]
                 .filter(Boolean)
                 .join(' · ')}</div></li>`,
           )
           .join('')}
       </ul>`
    : '';

  const flow = module.flow.length
    ? `<h3>How it is used</h3><ol class="flow">${module.flow
        .map((step) => `<li>${escape(step)}</li>`)
        .join('')}</ol>`
    : '';

  const actions = module.actions.length
    ? `<h3>What it does, and what each thing needs</h3>${module.actions.map(actionHtml).join('')}`
    : '<p class="none">Nothing is built yet.</p>';

  return `<article id="${slug(module.key)}">
    <h2>${escape(module.label)}${module.sold ? '' : ' <span class="tag">included</span>'}</h2>
    <p class="summary">${escape(module.summary)}</p>
    ${flow}
    ${screens}
    ${actions}
  </article>`;
}

/** Printable, self-contained, and readable on a phone. */
const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 0 20px 64px; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c1f23; background: #fff; }
main { max-width: 820px; margin: 0 auto; }
header { padding: 40px 0 24px; border-bottom: 2px solid #1c1f23; }
h1 { margin: 0 0 6px; font-size: 30px; letter-spacing: -0.02em; }
header .meta { color: #6b7280; font-size: 13px; }
nav { margin: 24px 0 8px; }
nav a { display: inline-block; margin: 0 10px 8px 0; color: #b4530f; text-decoration: none; border-bottom: 1px solid #f0d9c6; }
article { padding-top: 40px; border-top: 1px solid #e6e8eb; margin-top: 40px; }
article:first-of-type { border-top: 0; }
h2 { font-size: 24px; margin: 0 0 10px; }
h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; margin: 32px 0 10px; }
h4 { margin: 24px 0 6px; font-size: 14px; }
.summary { font-size: 16px; color: #333940; }
.tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; background: #eef2f5; color: #55606b; padding: 3px 8px; border-radius: 10px; vertical-align: middle; }
.flow li, .screens li { margin-bottom: 10px; }
.screens { list-style: none; padding: 0; }
.where { font-size: 12px; color: #8a929b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.action { border-left: 3px solid #f0d9c6; padding-left: 16px; margin: 20px 0; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: #f5f6f8; padding: 1px 5px; border-radius: 4px; }
.perm { font-size: 13px; color: #6b7280; margin: 4px 0; }
.none { color: #8a929b; font-style: italic; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 0; font-size: 14px; }
th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #e6e8eb; padding: 6px 10px 6px 0; }
td { padding: 8px 10px 8px 0; border-bottom: 1px solid #f0f2f4; vertical-align: top; }
td:first-child { white-space: nowrap; }
.req { font-size: 10px; text-transform: uppercase; color: #b4530f; }
.rule { font-size: 12px; color: #8a929b; }
.todo { color: #b0b6bd; }
@media print {
  body { padding: 0; }
  article { page-break-before: always; border-top: 0; }
  article:first-of-type { page-break-before: auto; }
  nav { display: none; }
}
`;

/**
 * One HTML document covering the modules given.
 *
 * `firm` names who it was prepared for, because a manual that arrives with no
 * addressee reads like a leaked internal document rather than something sent
 * on purpose.
 */
export function manualHtml(
  manual: ProductManual,
  options: { firm?: string; title?: string } = {},
): string {
  const title = options.title ?? 'FAS — what the software does';
  const modules = manual.modules;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
  <h1>${escape(title)}</h1>
  <div class="meta">
    ${options.firm ? `Prepared for ${escape(options.firm)} · ` : ''}FAS — Factory Automation
    Software, by FirstLeap Technologies · ${escape(manual.generatedAt)}
  </div>
</header>
<nav>${modules
    .map((module) => `<a href="#${slug(module.key)}">${escape(module.label)}</a>`)
    .join('')}</nav>
${modules.map(moduleHtml).join('')}
</main>
</body>
</html>
`;
}
