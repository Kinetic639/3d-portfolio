# ADR 0003: Runtime and editor facades

Status: Accepted; implementation deferred

WorldRuntime is the sole production facade: lifecycle, readonly snapshots, semantic commands, events and releaseable subscriptions. No scene/renderer access. Prepare resolves only at a defined ready state; disposal is asynchronous/idempotent; failed/cancelled transitions do not leave partially activated maps.

EditorSession is an application-local coordinator. Editing commands/history are separate from production commands. Its PlaySession exposes the same WorldRuntime, via a typed iframe proxy in editor Play. Proxy transport preserves ordering, cancellation, errors and run identity. Production gameplay DOM UI runs inside the frame through experience-ui. External diagnostics never add editor methods to the runtime facade.

Iframe destruction is not a substitute for testing cleanup. Await disposal and inspect ownership before removing it. Source edits and Play simulation state remain separate.
