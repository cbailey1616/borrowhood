internal import Expo
import UIKit

@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  override func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    super.scene(scene, willConnectTo: session, options: connectionOptions)
    let parchment = UIColor(red: 243.0 / 255.0, green: 235.0 / 255.0, blue: 221.0 / 255.0, alpha: 1)
    window?.backgroundColor = parchment
    window?.rootViewController?.view.backgroundColor = parchment
  }
}
