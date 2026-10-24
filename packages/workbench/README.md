# @rama/workbench

What makes House of Rama usable by people who are not coders (Stage 7, rules 15–16): nothing here is
reached through a terminal.

- `github.ts`: the GitHub client: who the token belongs to, creating a product's repository, pushing to it
  with the token passed through the environment of one `git push`, never stored in a remote or a log.
- `products.ts`: a new product (its site, first commit, first decision card, gate workflow) and its
  repository.
- `jobs.ts`: background work started by a button (refresh, photograph, audit, Test drive), recorded step by
  step in `work/.jobs/` so a page can show progress, a grey flag and the next action.
- `testdrive.ts`: the Test drive (rule 16): the whole loop on the sample product, pass or fail in words.
- `console.ts`: the trainer console's state: the acts, what enables each, the agenda.
