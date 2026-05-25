export namespace main {
	
	export class GraphQLRequest {
	    id: string;
	    name: string;
	    endpoint: string;
	    query: string;
	    variables: string;
	    timestamp: number;
	
	    static createFrom(source: any = {}) {
	        return new GraphQLRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.endpoint = source["endpoint"];
	        this.query = source["query"];
	        this.variables = source["variables"];
	        this.timestamp = source["timestamp"];
	    }
	}
	export class AppState {
	    theme: string;
	    lastEndpoint: string;
	    history: GraphQLRequest[];
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.lastEndpoint = source["lastEndpoint"];
	        this.history = this.convertValues(source["history"], GraphQLRequest);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CloudSyncState {
	    status: string;
	    message: string;
	    updatedAt: number;
	    localVersion: number;
	    cloudVersion: number;
	
	    static createFrom(source: any = {}) {
	        return new CloudSyncState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.message = source["message"];
	        this.updatedAt = source["updatedAt"];
	        this.localVersion = source["localVersion"];
	        this.cloudVersion = source["cloudVersion"];
	    }
	}
	export class CopySavedAPIRequest {
	    id: string;
	    collection: string;
	    folder: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new CopySavedAPIRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.collection = source["collection"];
	        this.folder = source["folder"];
	        this.name = source["name"];
	    }
	}
	export class EnvironmentVariable {
	    id: string;
	    key: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new EnvironmentVariable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.key = source["key"];
	        this.value = source["value"];
	    }
	}
	export class EnvironmentItem {
	    id: string;
	    name: string;
	    variables: EnvironmentVariable[];
	
	    static createFrom(source: any = {}) {
	        return new EnvironmentItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.variables = this.convertValues(source["variables"], EnvironmentVariable);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EnvironmentStore {
	    activeEnvironmentId: string;
	    environments: EnvironmentItem[];
	
	    static createFrom(source: any = {}) {
	        return new EnvironmentStore(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activeEnvironmentId = source["activeEnvironmentId"];
	        this.environments = this.convertValues(source["environments"], EnvironmentItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class FolderPathRequest {
	    collection: string;
	    folderPath: string;
	
	    static createFrom(source: any = {}) {
	        return new FolderPathRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.collection = source["collection"];
	        this.folderPath = source["folderPath"];
	    }
	}
	export class GoogleDriveConfigRequest {
	    clientId: string;
	    clientSecret: string;
	    redirectPort: number;
	    lockTTLSecond: number;
	    accountEmail: string;
	
	    static createFrom(source: any = {}) {
	        return new GoogleDriveConfigRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clientId = source["clientId"];
	        this.clientSecret = source["clientSecret"];
	        this.redirectPort = source["redirectPort"];
	        this.lockTTLSecond = source["lockTTLSecond"];
	        this.accountEmail = source["accountEmail"];
	    }
	}
	export class GoogleDriveConfigView {
	    clientId: string;
	    clientSecretSet: boolean;
	    redirectPort: number;
	    lockTTLSecond: number;
	    accountEmail: string;
	
	    static createFrom(source: any = {}) {
	        return new GoogleDriveConfigView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.clientId = source["clientId"];
	        this.clientSecretSet = source["clientSecretSet"];
	        this.redirectPort = source["redirectPort"];
	        this.lockTTLSecond = source["lockTTLSecond"];
	        this.accountEmail = source["accountEmail"];
	    }
	}
	
	export class JSONFileResult {
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new JSONFileResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}
	export class MoveFolderRequest {
	    srcCollection: string;
	    srcPath: string;
	    destCollection: string;
	    destPath: string;
	    dropPosition: string;
	
	    static createFrom(source: any = {}) {
	        return new MoveFolderRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.srcCollection = source["srcCollection"];
	        this.srcPath = source["srcPath"];
	        this.destCollection = source["destCollection"];
	        this.destPath = source["destPath"];
	        this.dropPosition = source["dropPosition"];
	    }
	}
	export class RenameCollectionRequest {
	    oldName: string;
	    newName: string;
	
	    static createFrom(source: any = {}) {
	        return new RenameCollectionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.oldName = source["oldName"];
	        this.newName = source["newName"];
	    }
	}
	export class RenameFolderRequest {
	    collection: string;
	    folderPath: string;
	    newName: string;
	
	    static createFrom(source: any = {}) {
	        return new RenameFolderRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.collection = source["collection"];
	        this.folderPath = source["folderPath"];
	        this.newName = source["newName"];
	    }
	}
	export class SavedAPI {
	    id: string;
	    name: string;
	    collection: string;
	    folder: string;
	    endpoint: string;
	    query: string;
	    variables: string;
	    headers: string;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SavedAPI(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.collection = source["collection"];
	        this.folder = source["folder"];
	        this.endpoint = source["endpoint"];
	        this.query = source["query"];
	        this.variables = source["variables"];
	        this.headers = source["headers"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class SavedFolder {
	    name: string;
	    folders: SavedFolder[];
	
	    static createFrom(source: any = {}) {
	        return new SavedFolder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.folders = this.convertValues(source["folders"], SavedFolder);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SavedCollection {
	    name: string;
	    folders: SavedFolder[];
	
	    static createFrom(source: any = {}) {
	        return new SavedCollection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.folders = this.convertValues(source["folders"], SavedFolder);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SavedFolderRequest {
	    collection: string;
	    parentPath: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedFolderRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.collection = source["collection"];
	        this.parentPath = source["parentPath"];
	        this.name = source["name"];
	    }
	}
	export class Workspace {
	    id: string;
	    name: string;
	    createdAt: number;
	    updatedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new Workspace(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}

}

export namespace services {
	
	export class APIRequest {
	    url: string;
	    method: string;
	    headers: Record<string, string>;
	    body: string;
	
	    static createFrom(source: any = {}) {
	        return new APIRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.method = source["method"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	    }
	}
	export class HTTPCookie {
	    name: string;
	    value: string;
	    domain: string;
	    path: string;
	    expires: string;
	    httpOnly: boolean;
	    secure: boolean;
	
	    static createFrom(source: any = {}) {
	        return new HTTPCookie(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.domain = source["domain"];
	        this.path = source["path"];
	        this.expires = source["expires"];
	        this.httpOnly = source["httpOnly"];
	        this.secure = source["secure"];
	    }
	}
	export class APIResponse {
	    statusCode: number;
	    status: string;
	    headers: Record<string, string>;
	    body: string;
	    cookies: HTTPCookie[];
	    duration: number;
	    size: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new APIResponse(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statusCode = source["statusCode"];
	        this.status = source["status"];
	        this.headers = source["headers"];
	        this.body = source["body"];
	        this.cookies = this.convertValues(source["cookies"], HTTPCookie);
	        this.duration = source["duration"];
	        this.size = source["size"];
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SubscriptionRequest {
	    id: string;
	    url: string;
	    headers: Record<string, string>;
	    query: string;
	    variables: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new SubscriptionRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.headers = source["headers"];
	        this.query = source["query"];
	        this.variables = source["variables"];
	    }
	}

}

