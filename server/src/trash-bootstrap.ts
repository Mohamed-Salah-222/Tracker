import { installTrash } from "./lib/trash";

/**
 * Installs the undo plugin on Mongoose itself.
 *
 * A global plugin only applies to schemas created after it is registered, and schemas
 * are created the moment a model file is imported. So this has to run before any of
 * them, which is why it is a module of its own imported at the top of index.ts rather
 * than a line in the startup function: imports are hoisted, function bodies are not.
 */
installTrash();
