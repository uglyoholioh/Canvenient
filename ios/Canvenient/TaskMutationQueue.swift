import Foundation
import CanvenientKit

/// A task write that happened while the hosted backend was unreachable,
/// persisted so it can be replayed when the connection returns. Create ops
/// carry the phantom id the UI showed while offline, so completing or
/// deleting that row later updates the queued create instead of stacking a
/// second op on a task the server has never seen.
struct QueuedTaskOp: Codable {
    enum Kind: String, Codable {
        case create, complete, delete
    }

    var id: String = UUID().uuidString
    var kind: Kind
    /// Phantom (negative) id the UI used for an offline-created task.
    var localId: Int?
    /// Server task id for complete/delete ops.
    var taskId: Int?
    /// Create payload, replayed as-is.
    var payload: TaskCreate?
    /// A created task that was also completed while still offline replays
    /// as create-then-complete.
    var markDone: Bool = false
}

/// The queue itself: an ordered list persisted through OfflineCache, so it
/// lives in the app-group container and survives relaunches. Sign-out clears
/// the whole cache (including this queue) with the session.
@MainActor
final class TaskMutationQueue: ObservableObject {
    static let shared = TaskMutationQueue()

    private let key = "task-mutation-queue"
    /// Local ids grow more negative so they can never collide with real ids.
    private var nextLocalId: Int

    private init() {
        // Keep phantom ids unique across launches by resuming below the
        // lowest one ever issued.
        let lowest = UserDefaults.standard.integer(forKey: "taskqueue.lowestLocalId")
        nextLocalId = min(lowest, -1)
    }

    var all: [QueuedTaskOp] {
        OfflineCache.shared.load([QueuedTaskOp].self, key: key) ?? []
    }

    func nextLocalTaskId() -> Int {
        nextLocalId -= 1
        UserDefaults.standard.set(nextLocalId, forKey: "taskqueue.lowestLocalId")
        return nextLocalId + 1
    }

    func enqueue(_ op: QueuedTaskOp) {
        var ops = all
        ops.append(op)
        OfflineCache.shared.save(ops, key: key)
        objectWillChange.send()
    }

    func opWithLocalId(_ localId: Int) -> QueuedTaskOp? {
        all.first { $0.kind == .create && $0.localId == localId }
    }

    func update(_ op: QueuedTaskOp) {
        var ops = all
        guard let index = ops.firstIndex(where: { $0.id == op.id }) else { return }
        ops[index] = op
        OfflineCache.shared.save(ops, key: key)
        objectWillChange.send()
    }

    func removeCreate(localId: Int) {
        var ops = all
        ops.removeAll { $0.kind == .create && $0.localId == localId }
        OfflineCache.shared.save(ops, key: key)
        objectWillChange.send()
    }

    func remove(id: String) {
        var ops = all
        ops.removeAll { $0.id == id }
        OfflineCache.shared.save(ops, key: key)
        objectWillChange.send()
    }
}
