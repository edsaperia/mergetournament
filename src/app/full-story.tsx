/**
 * The full landing copy behind "Tell me more" — mirrors docs/COPY.md
 * (which remains the canonical prose; keep the two in sync when editing).
 * Hand-typeset as JSX because the site has no markdown renderer and the
 * homepage should stay statically prerendered.
 */

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 text-xl font-semibold first:mt-2">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-soft">{children}</p>;
}

export function FullStory() {
  return (
    <details className="group rounded-lg border border-edge px-5 py-4">
      <summary className="cursor-pointer font-semibold">
        Tell me more
      </summary>

      <H>What it is</H>
      <P>
        A merge tournament takes a set of draft documents — position papers, proposed
        constitutions, competing specifications — and produces a single canonical text. Drafts
        are seeded into a knockout bracket at random. In each round, pairs of texts meet: their
        two bearers negotiate a merged text in a shared editor, against a fixed deadline. Both
        must consent to the result. If they agree, the merged text advances, carried forward by
        one of the two, chosen by agreement or by lot. If the clock expires first, a coin flip
        selects one of the two input texts to advance intact.
      </P>
      <P>
        Rounds halve the field until one text remains. Twenty drafts become one in five rounds;
        the whole process fits comfortably in half a day. The full bracket — every pairing,
        every scheduled time — is published before the first round begins, and the completed
        bracket, with every intermediate text and the discussion that produced it, remains as a
        permanent, explorable record.
      </P>
      <P>
        This site provides the software that runs the event: submission, seeding, scheduling,
        the collaborative merge workspaces, the coin flips, and the archive. The software is
        open source and self-hostable, with magic-link authentication and no accounts.
      </P>

      <H>When you might want one</H>
      <P>
        The method suits any situation where a group must produce one authoritative document
        from many, and where the usual alternatives fail in familiar ways: plenary drafting
        sessions that reward stamina and volume; committee synthesis that launders disagreement
        into vagueness; voting between drafts, which discards everything in the losing texts.
      </P>
      <P>
        It was built for constitutional conventions — a cohort of ten to thirty people, each
        arriving with a complete draft, needing to leave with a founding document that everyone
        had a hand in. But the structure is general: standards bodies reconciling competing
        proposals, activist groups synthesising position papers, communities drafting charters
        or codes of conduct, workshops that want a genuine collective artefact rather than a
        facilitator&apos;s summary.
      </P>
      <P>
        Two properties distinguish it from adjacent methods. Every participant negotiates
        directly rather than through a facilitator or a floor debate; and every draft, including
        the eliminated ones, is preserved with full provenance, so the final text can be traced
        back through every merge to its origins.
      </P>

      <H>How it runs</H>
      <P>
        Participants each submit a draft document before a deadline. The system builds the
        bracket, seeds it uniformly at random, publishes the schedule, and from that point runs
        itself. Rounds open and close on the clock; breaks between rounds let everyone read the
        surviving texts and lobby the bearers of the next round; unresolved merges are settled
        by an animated coin flip. The administrator has exactly two live controls: begin, and
        pause. There is deliberately no discretion beyond that: no extending a round, no
        reassigning a pairing, no overriding a flip.
      </P>
      <P>
        At the end you have one canonical text; the complete provenance tree, tracing it back
        through every merge to every original draft; all eliminated texts, preserved and
        attributed; every discussion thread, kept open in perpetuity as an annotation layer for
        future readers; and an append-only audit log, including every random seed, from which
        the entire tournament can be reproduced.
      </P>

      <H>The theory</H>
      <P>
        The design is an application of bargaining theory, and its central move is
        decomposition. Multilateral negotiation has no canonical solution: with three or more
        parties, coalitions form, cycles appear, and outcomes depend on agenda order. Bilateral
        negotiation is the only bargaining problem whose solution survives strategic play. The
        tournament therefore decomposes an <i>n</i>-party negotiation into <i>n</i> − 1
        two-party negotiations, arranged on a binary tree of depth log <i>n</i>.
      </P>
      <P>
        Each merge is then a Nash bargaining game whose disagreement point is a fair lottery
        over the two input texts. This threat point is symmetric, so neither party holds
        positional advantage; it is what makes stonewalling unattractive, since refusing to
        negotiate yields not the status quo but a gamble. Composed up the tree, the equilibrium
        in which nobody negotiates at all is exactly (via random seeding) uniform random
        dictatorship over the original drafts — the canonical strategyproof mechanism, but a
        bleak one. The tournament is best understood as random dictatorship plus a standing
        right to Pareto-improve on it by unanimous consent: every negotiated merge is a
        voluntary escape from a lottery both parties dislike.
      </P>
      <P>
        The remaining machinery secures the conditions under which this works. The clock
        provides a finite horizon, which makes delay worthless and forecloses wars of
        attrition. Uniformly random seeding destroys agenda-setting power and gives every draft
        an equal ex-ante chance of becoming the final text.
      </P>
    </details>
  );
}
