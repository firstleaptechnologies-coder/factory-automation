package com.firstleap.factoryautomation

import expo.modules.ReactActivityDelegateWrapper

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "DecorBucket"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      // Wrapped so Expo's modules see the activity's lifecycle — expo-updates
      // needs it to know when the app came to the front.
      ReactActivityDelegateWrapper(
          this,
          fabricEnabled,
          DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled),
      )
}
