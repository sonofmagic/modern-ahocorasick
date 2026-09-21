import assert from 'node:assert/strict'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const base = new URL(process.argv[2] ?? 'https://aho.icebreaker.top')
const expected = process.argv[3]
const attempts = Number(process.env['DOCS_VERIFY_ATTEMPTS'] ?? 1)
assert(Number.isInteger(attempts) && attempts >= 1 && attempts <= 30)
if (expected) {
  assert.match(expected, /^[a-f0-9]{40}$/)
}

async function verify() {
  for (const path of [
    '/',
    '/zh/',
    '/getting-started',
    '/zh/api',
    '/visualization',
    '/zh/visualization',
  ]) {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(15000),
    })
    assert.equal(response.status, 200, path)
    assert.match(
      response.headers.get('content-type') ?? '',
      /text\/html/,
      path,
    )
    assert.match(await response.text(), /modern-ahocorasick/, path)
  }
  const missing = await fetch(new URL('/__deployment_missing_page__', base), {
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(missing.status, 404, 'Missing paths must return a real 404')
  const info = await fetch(
    new URL(`/build-info.json?commit=${expected ?? 'check'}`, base),
    { cache: 'no-store', signal: AbortSignal.timeout(15000) },
  )
  assert.equal(info.status, 200, 'build-info.json')
  assert.match(info.headers.get('cache-control') ?? '', /no-store/)
  const { commit } = await info.json()
  assert.match(commit, /^[a-f0-9]{40}$/)
  if (expected) {
    assert.equal(commit, expected, 'Deployed commit')
  }
  console.log(
    `Verified ${base.origin}: bilingual pages, clean URLs, 404, and commit ${commit}`,
  )
}

for (let attempt = 1; ; attempt++) {
  try {
    await verify()
    break
  }
  catch (error) {
    if (attempt >= attempts) {
      throw error
    }
    console.log(
      `Waiting for deployment/DNS/HTTPS (${attempt}/${attempts}): ${error.message}`,
    )
    await setTimeout(10000)
  }
}
