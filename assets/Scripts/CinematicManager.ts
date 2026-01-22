import { _decorator, Node, Director, director, Sprite, Color, UITransform, Widget, tween, view, Layers, BlockInputEvents, SpriteFrame, Texture2D, ImageAsset } from 'cc';
const { ccclass } = _decorator;

@ccclass('CinematicManager')
export class CinematicManager {

    private static _instance: CinematicManager | null = null;
    
    // UI 节点引用
    private _rootNode: Node | null = null;
    private _topBar: Node | null = null;
    private _bottomBar: Node | null = null;

    // 配置参数
    private readonly animDuration: number = 0.5;
    private readonly coverRatio: number = 0.15; // 黑边占比 15%
    private readonly zIndex: number = 999; // 保证在最上层

    public static get instance(): CinematicManager {
        if (!this._instance) {
            this._instance = new CinematicManager();
        }
        return this._instance;
    }

    /**
     * 显示黑边
     */
    public show() {
        this.ensureUIExists(); // 关键：每次调用前检查UI是否存在，不存在则创建
        
        if (!this._topBar || !this._bottomBar) return;

        const screenHeight = view.getVisibleSize().height;
        const targetHeight = screenHeight * this.coverRatio;

        // 停止之前的动画
        tween(this._topBar.getComponent(UITransform)).stop();
        tween(this._bottomBar.getComponent(UITransform)).stop();

        // 执行动画
        tween(this._topBar.getComponent(UITransform))
            .to(this.animDuration, { height: targetHeight }, { easing: 'cubicOut' })
            .start();

        tween(this._bottomBar.getComponent(UITransform))
            .to(this.animDuration, { height: targetHeight }, { easing: 'cubicOut' })
            .start();
    }

    /**
     * 隐藏黑边
     */
    public hide() {
        if (!this._rootNode) return;

        // 停止之前的动画
        tween(this._topBar!.getComponent(UITransform)).stop();
        tween(this._bottomBar!.getComponent(UITransform)).stop();

        // 缩回高度为 0
        tween(this._topBar!.getComponent(UITransform))
            .to(this.animDuration, { height: 0 }, { easing: 'cubicOut' })
            .start();

        tween(this._bottomBar!.getComponent(UITransform))
            .to(this.animDuration, { height: 0 }, { easing: 'cubicOut' })
            // 动画结束后，可选：销毁节点或仅仅留空
            .call(() => {
                // 如果你想在隐藏时彻底销毁节点以节省内存（通常没必要）：
                // this.destroyUI(); 
            })
            .start();
    }

    /**
     * 核心逻辑：使用纯代码构建 UI 树
     * 这样就不需要依赖 Prefab 或手动在场景里放节点了
     */
    private ensureUIExists() {
        // 1. 检查当前 Canvas 是否有效
        const scene = director.getScene();
        if (!scene) return;
        
        // 查找场景中的 Canvas（通常 UI 都要挂在 Canvas 下）
        // 如果你的项目有特定的 UI 根节点，可以用 find('UIRoot')
        const canvas = scene.getComponentInChildren('cc.Canvas')?.node; 
        
        if (!canvas) {
            console.warn("CinematicManager: 当前场景未找到 Canvas，无法生成黑边。");
            return;
        }

        // 2. 检查节点是否依然有效（防止切换场景后节点被销毁引用丢失）
        if (this._rootNode && this._rootNode.isValid) {
            // 如果节点还在（比如常驻节点），且父节点正确，直接返回
            // 如果切换了场景，旧的 rootNode 可能已经失效，isValid 会变成 false
            return; 
        }

        // 3. 开始构建节点结构
        // 结构: CinematicLayer (全屏透明, 拦截点击) -> TopBar, BottomBar

        // --- Root Node ---
        this._rootNode = new Node('CinematicLayer');
        this._rootNode.layer = Layers.Enum.UI_2D;
        canvas.addChild(this._rootNode);
        
        // 设置全屏 Widget
        const rootTrans = this._rootNode.addComponent(UITransform);
        rootTrans.setContentSize(view.getVisibleSize()); // 初始大小
        const rootWidget = this._rootNode.addComponent(Widget);
        rootWidget.isAlignTop = true; rootWidget.top = 0;
        rootWidget.isAlignBottom = true; rootWidget.bottom = 0;
        rootWidget.isAlignLeft = true; rootWidget.left = 0;
        rootWidget.isAlignRight = true; rootWidget.right = 0;
        
        // 拦截点击事件 (防止穿透点击) - 可选，看你是否希望玩家在黑边模式下点击地图
        // this._rootNode.addComponent(BlockInputEvents); 

        // 设置层级 (Z-Index)，确保覆盖在大部分 UI 之上
        this._rootNode.setSiblingIndex(this.zIndex);

        // --- 创建纯色纹理 (Black) ---
        // Cocos 内置了 'default_sprite_splash' (白色)，我们把它染成黑色即可
        
        // --- Top Bar ---
        this._topBar = this.createBarNode('TopBar');
        this._rootNode.addChild(this._topBar);
        const topWidget = this._topBar.addComponent(Widget);
        topWidget.isAlignTop = true; topWidget.top = 0;
        topWidget.isAlignLeft = true; topWidget.left = 0;
        topWidget.isAlignRight = true; topWidget.right = 0;
        // 锚点设为 (0.5, 1) 也就是上边缘中心
        this._topBar.getComponent(UITransform)!.setAnchorPoint(0.5, 1);

        // --- Bottom Bar ---
        this._bottomBar = this.createBarNode('BottomBar');
        this._rootNode.addChild(this._bottomBar);
        const botWidget = this._bottomBar.addComponent(Widget);
        botWidget.isAlignBottom = true; botWidget.bottom = 0;
        botWidget.isAlignLeft = true; botWidget.left = 0;
        botWidget.isAlignRight = true; botWidget.right = 0;
        // 锚点设为 (0.5, 0) 也就是下边缘中心
        this._bottomBar.getComponent(UITransform)!.setAnchorPoint(0.5, 0);
    }

    private createBarNode(name: string): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        
        // 添加 Sprite
        const sprite = node.addComponent(Sprite);
        sprite.color = Color.BLACK; // 染成黑色
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        
        // 初始高度为 0
        const uiTrans = node.addComponent(UITransform);
        uiTrans.setContentSize(100, 0); // 宽度会被 Widget 拉伸，高度由逻辑控制

        return node;
    }
}